import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Template } from '../entities/template.entity';
import { TemplateField } from '../entities/template-field.entity';
// TemplateField is imported even though no direct repo injection
// because the transaction code calls `manager.getRepository(TemplateField)`
// and that needs the entity class reference at runtime.
import {
	CreateTemplateDto,
	UpdateTemplateDto,
	normalizeRule,
	TemplateResponseDto,
	TemplateFieldResponseDto,
	RuleDtoUnion,
} from '../dtos';

const NOT_FOUND_MESSAGE = 'Template not found';

interface CreateTemplateInput {
	dto: CreateTemplateDto;
	orgId: string;
	userId: string;
}

interface UpdateTemplateInput {
	id: string;
	dto: UpdateTemplateDto;
	orgId: string;
}

/**
 * Org-scoped template CRUD service.
 *
 * Every query filters by `organizationId` (defense in depth — the
 * controller guard already gates the org context, but the service
 * never trusts that alone). Cross-org reads return a NotFoundException
 * rather than ForbiddenException so we never leak existence of another
 * org's templates.
 *
 * Create + update run inside a transaction so the parent + field rows
 * land atomically.
 *
 * Update preserves field ids: payload fields carrying an `id` UPDATE
 * the existing row in place; payload fields without `id` INSERT a new
 * row; any existing field whose id isn't in the payload's "kept" set
 * is deleted. The earlier delete-and-reinsert algorithm regenerated
 * every field UUID on every save, which orphaned client-side state
 * keyed by field id (e.g. image-card assignments).
 */
@Injectable()
export class TemplateService {
	private readonly logger = new Logger(TemplateService.name);

	constructor(
		@InjectRepository(Template)
		private readonly templateRepo: Repository<Template>,
		private readonly dataSource: DataSource,
	) {}

	async findAll(orgId: string): Promise<TemplateResponseDto[]> {
		const rows = await this.templateRepo.find({
			where: { organizationId: orgId },
			order: { createdAt: 'DESC' },
		});
		// `eager: true` loads `fields`, but the order isn't guaranteed by
		// the eager-load query. Re-sort by `position` for response shape
		// stability.
		return rows.map((row) => this.toResponse(row));
	}

	async findOne(id: string, orgId: string): Promise<TemplateResponseDto> {
		const row = await this.templateRepo.findOne({
			where: { id, organizationId: orgId },
		});
		if (!row) {
			throw new NotFoundException(NOT_FOUND_MESSAGE);
		}
		return this.toResponse(row);
	}

	async create(input: CreateTemplateInput): Promise<TemplateResponseDto> {
		const { dto, orgId, userId } = input;

		const saved = await this.dataSource.transaction(async (manager) => {
			const templateRepo = manager.getRepository(Template);
			const fieldRepo = manager.getRepository(TemplateField);

			const template = templateRepo.create({
				organizationId: orgId,
				createdById: userId,
				name: dto.name,
			});
			const savedTemplate = await templateRepo.save(template);

			const fields = dto.fields.map((field, index) =>
				fieldRepo.create({
					templateId: savedTemplate.id,
					label: field.label,
					position: index,
					rules: field.rules.map((rule) => normalizeRule(rule)),
				}),
			);
			const savedFields = await fieldRepo.save(fields);
			savedTemplate.fields = savedFields;

			return savedTemplate;
		});

		this.logger.log(
			`Template created: ${saved.id} (org=${orgId}, fields=${saved.fields.length})`,
		);
		return this.toResponse(saved);
	}

	async update(input: UpdateTemplateInput): Promise<TemplateResponseDto> {
		const { id, dto, orgId } = input;

		// Existence + org check up front (in the same query path the
		// non-transactional `findOne` uses) so we 404 before opening a
		// transaction.
		const existing = await this.templateRepo.findOne({
			where: { id, organizationId: orgId },
		});
		if (!existing) {
			throw new NotFoundException(NOT_FOUND_MESSAGE);
		}

		const saved = await this.dataSource.transaction(async (manager) => {
			const templateRepo = manager.getRepository(Template);
			const fieldRepo = manager.getRepository(TemplateField);

			existing.name = dto.name;
			const savedTemplate = await templateRepo.save(existing);

			// Preserve field ids on update. For each payload field with
			// an `id` matching an existing row on this template, update
			// in place; for each payload field without an `id`, insert a
			// new row; delete any existing row whose id is not in the
			// kept set.
			const existingFields = existing.fields ?? [];
			const existingById = new Map<string, TemplateField>(
				existingFields.map((f) => [f.id, f]),
			);
			const keptIds = new Set<string>();
			const fieldRowsToSave: TemplateField[] = [];

			dto.fields.forEach((field, index) => {
				const incomingId = field.id;
				const existingRow = incomingId
					? existingById.get(incomingId)
					: undefined;

				if (existingRow) {
					// In-place update — id and createdAt stay the same.
					existingRow.label = field.label;
					existingRow.position = index;
					existingRow.rules = field.rules.map((rule) =>
						normalizeRule(rule),
					);
					keptIds.add(existingRow.id);
					fieldRowsToSave.push(existingRow);
				} else {
					// New row — let the database assign the id.
					fieldRowsToSave.push(
						fieldRepo.create({
							templateId: savedTemplate.id,
							label: field.label,
							position: index,
							rules: field.rules.map((rule) =>
								normalizeRule(rule),
							),
						}),
					);
				}
			});

			// Delete fields the payload omitted.
			const toDelete = existingFields
				.filter((f) => !keptIds.has(f.id))
				.map((f) => f.id);
			if (toDelete.length > 0) {
				await fieldRepo.delete(toDelete);
			}

			const savedFields = await fieldRepo.save(fieldRowsToSave);
			savedTemplate.fields = savedFields;

			return savedTemplate;
		});

		this.logger.log(
			`Template updated: ${saved.id} (org=${orgId}, fields=${saved.fields.length})`,
		);
		return this.toResponse(saved);
	}

	async delete(id: string, orgId: string): Promise<void> {
		const result = await this.templateRepo.delete({
			id,
			organizationId: orgId,
		});
		if (!result.affected || result.affected === 0) {
			throw new NotFoundException(NOT_FOUND_MESSAGE);
		}
	}

	private toResponse(template: Template): TemplateResponseDto {
		const fields: TemplateFieldResponseDto[] = (template.fields ?? [])
			.slice()
			.sort((a, b) => a.position - b.position)
			.map((field) => ({
				id: field.id,
				label: field.label,
				position: field.position,
				rules: (field.rules ?? []) as RuleDtoUnion[],
			}));

		return {
			id: template.id,
			organizationId: template.organizationId,
			createdById: template.createdById,
			name: template.name,
			fields,
			createdAt: template.createdAt,
			updatedAt: template.updatedAt,
		};
	}
}
