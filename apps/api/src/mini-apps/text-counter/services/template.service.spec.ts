import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { Template } from '../entities/template.entity';
import { TemplateField } from '../entities/template-field.entity';
import { CreateTemplateDto, UpdateTemplateDto } from '../dtos';

import { TemplateService } from './template.service';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function mockRepository() {
	return {
		create: jest.fn((entity) => entity),
		save: jest.fn(),
		find: jest.fn(),
		findOne: jest.fn(),
		delete: jest.fn(),
	};
}

function mockManager() {
	const templateRepo = mockRepository();
	const fieldRepo = mockRepository();
	const manager = {
		getRepository: jest.fn((entity: any) => {
			if (entity === Template) return templateRepo;
			if (entity === TemplateField) return fieldRepo;
			throw new Error(`Unexpected entity in mock manager: ${entity}`);
		}),
		// Track which repos were handed out so tests can assert on them.
		_templateRepo: templateRepo,
		_fieldRepo: fieldRepo,
	};
	return manager;
}

function createMockTemplate(overrides: Partial<Template> = {}): Template {
	const t = new Template();
	t.id = uuidv4();
	t.organizationId = uuidv4();
	t.createdById = uuidv4();
	t.name = 'Holiday Carousel';
	t.fields = [];
	t.createdAt = new Date();
	t.updatedAt = new Date();
	Object.assign(t, overrides);
	return t;
}

function createMockField(
	overrides: Partial<TemplateField> = {},
): TemplateField {
	const f = new TemplateField();
	f.id = uuidv4();
	f.templateId = uuidv4();
	f.label = 'headline';
	f.position = 0;
	f.rules = [];
	f.createdAt = new Date();
	f.updatedAt = new Date();
	Object.assign(f, overrides);
	return f;
}

function buildCreateDto(
	overrides: Partial<CreateTemplateDto> = {},
): CreateTemplateDto {
	return {
		name: 'Holiday Carousel',
		fields: [
			{
				label: 'headline',
				rules: [{ type: 'maxCharacters', value: 25 }],
			},
			{
				label: 'body',
				rules: [{ type: 'maxWords', value: 30 }],
			},
		],
		...overrides,
	} as CreateTemplateDto;
}

describe('TemplateService', () => {
	let service: TemplateService;
	let templateRepo: jest.Mocked<Repository<Template>>;
	let dataSource: { transaction: jest.Mock };

	beforeEach(async () => {
		const templateToken = getRepositoryToken(Template);

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				TemplateService,
				{ provide: templateToken, useFactory: mockRepository },
				{
					provide: DataSource,
					useValue: { transaction: jest.fn() },
				},
			],
		}).compile();

		service = module.get(TemplateService);
		templateRepo = module.get(templateToken);
		dataSource = module.get(DataSource);
	});

	// -----------------------------------------------------------------------
	// findAll
	// -----------------------------------------------------------------------
	describe('findAll', () => {
		it('returns only templates for the given organization', async () => {
			const orgA = uuidv4();
			const orgB = uuidv4();
			const orgATemplate = createMockTemplate({
				organizationId: orgA,
				fields: [
					createMockField({ position: 0 }),
					createMockField({ position: 1, label: 'body' }),
				],
			});
			templateRepo.find.mockResolvedValueOnce([orgATemplate]);
			templateRepo.find.mockResolvedValueOnce([]);

			const orgAResult = await service.findAll(orgA);
			const orgBResult = await service.findAll(orgB);

			expect(orgAResult).toHaveLength(1);
			expect(orgAResult[0].id).toBe(orgATemplate.id);
			expect(orgBResult).toHaveLength(0);

			expect(templateRepo.find).toHaveBeenNthCalledWith(
				1,
				expect.objectContaining({
					where: { organizationId: orgA },
				}),
			);
			expect(templateRepo.find).toHaveBeenNthCalledWith(
				2,
				expect.objectContaining({
					where: { organizationId: orgB },
				}),
			);
		});

		it('sorts the fields array by position ASC in the response', async () => {
			const orgId = uuidv4();
			const tmpl = createMockTemplate({
				organizationId: orgId,
				fields: [
					createMockField({ position: 2, label: 'cta' }),
					createMockField({ position: 0, label: 'headline' }),
					createMockField({ position: 1, label: 'body' }),
				],
			});
			templateRepo.find.mockResolvedValue([tmpl]);

			const result = await service.findAll(orgId);

			expect(result[0].fields.map((f) => f.label)).toEqual([
				'headline',
				'body',
				'cta',
			]);
		});
	});

	// -----------------------------------------------------------------------
	// findOne
	// -----------------------------------------------------------------------
	describe('findOne', () => {
		it('returns the template when org matches', async () => {
			const tmpl = createMockTemplate();
			templateRepo.findOne.mockResolvedValue(tmpl);

			const result = await service.findOne(tmpl.id, tmpl.organizationId);

			expect(result.id).toBe(tmpl.id);
			expect(templateRepo.findOne).toHaveBeenCalledWith({
				where: { id: tmpl.id, organizationId: tmpl.organizationId },
			});
		});

		it('throws NotFoundException when looking up an orgA template as orgB', async () => {
			// Service receives a wrong-org request; repo returns null because
			// the filter doesn't match. Service should 404, not 403 — that's
			// the documented existence-leak posture.
			templateRepo.findOne.mockResolvedValue(null);

			await expect(service.findOne(uuidv4(), uuidv4())).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	// -----------------------------------------------------------------------
	// create
	// -----------------------------------------------------------------------
	describe('create', () => {
		it('creates template + child fields atomically and returns ordered fields', async () => {
			const orgId = uuidv4();
			const userId = uuidv4();
			const dto = buildCreateDto();

			const manager = mockManager();
			const savedTemplate = createMockTemplate({
				organizationId: orgId,
				createdById: userId,
				name: dto.name,
			});
			const savedFields = [
				createMockField({
					templateId: savedTemplate.id,
					label: 'headline',
					position: 0,
					rules: [{ type: 'maxCharacters', value: 25 }],
				}),
				createMockField({
					templateId: savedTemplate.id,
					label: 'body',
					position: 1,
					rules: [{ type: 'maxWords', value: 30 }],
				}),
			];
			manager._templateRepo.save.mockResolvedValue(savedTemplate);
			manager._fieldRepo.save.mockResolvedValue(savedFields);

			dataSource.transaction.mockImplementation(async (cb: any) =>
				cb(manager),
			);

			const result = await service.create({ dto, orgId, userId });

			expect(result.name).toBe(dto.name);
			expect(result.fields).toHaveLength(2);
			expect(result.fields[0].label).toBe('headline');
			expect(result.fields[0].position).toBe(0);
			expect(result.fields[1].label).toBe('body');
			expect(result.fields[1].position).toBe(1);

			// Position is derived from the input array index — guard against
			// regressions that try to source it from the DTO directly.
			const savedFieldArg = manager._fieldRepo.save.mock.calls[0][0];
			expect(savedFieldArg[0].position).toBe(0);
			expect(savedFieldArg[1].position).toBe(1);

			// Verify the rules normalize through to stored JSONB shape.
			expect(savedFieldArg[0].rules).toEqual([
				{ type: 'maxCharacters', value: 25 },
			]);
		});

		it('round-trips each of the six rule types through normalization', async () => {
			const orgId = uuidv4();
			const userId = uuidv4();
			const dto: CreateTemplateDto = {
				name: 'All Rules',
				fields: [
					{
						label: 'one',
						rules: [
							{ type: 'maxCharacters', value: 10 },
							{ type: 'maxWords', value: 5 },
							{ type: 'minCharacters', value: 1 },
							{ type: 'minWords', value: 1 },
							{ type: 'singleLine' },
							{
								type: 'forbiddenWords',
								values: ['free', 'guaranteed'],
							},
						],
					},
				],
			} as CreateTemplateDto;

			const manager = mockManager();
			const savedTemplate = createMockTemplate({
				organizationId: orgId,
				createdById: userId,
				name: dto.name,
			});
			manager._templateRepo.save.mockResolvedValue(savedTemplate);
			manager._fieldRepo.save.mockImplementation(async (rows: any) =>
				rows.map((r: any) => ({
					...r,
					id: uuidv4(),
					createdAt: new Date(),
					updatedAt: new Date(),
				})),
			);

			dataSource.transaction.mockImplementation(async (cb: any) =>
				cb(manager),
			);

			const result = await service.create({ dto, orgId, userId });

			expect(result.fields[0].rules).toEqual([
				{ type: 'maxCharacters', value: 10 },
				{ type: 'maxWords', value: 5 },
				{ type: 'minCharacters', value: 1 },
				{ type: 'minWords', value: 1 },
				{ type: 'singleLine' },
				{ type: 'forbiddenWords', values: ['free', 'guaranteed'] },
			]);
		});
	});

	// -----------------------------------------------------------------------
	// update
	// -----------------------------------------------------------------------
	describe('update', () => {
		it('inserts new fields and deletes existing fields the payload omits', async () => {
			const tmpl = createMockTemplate();
			const orgId = tmpl.organizationId;
			templateRepo.findOne.mockResolvedValue(tmpl);

			const dto: UpdateTemplateDto = {
				name: 'Renamed',
				fields: [
					{
						label: 'new-headline',
						rules: [{ type: 'singleLine' }],
					},
				],
			} as UpdateTemplateDto;

			const manager = mockManager();
			const newFields = [
				createMockField({
					templateId: tmpl.id,
					label: 'new-headline',
					position: 0,
					rules: [{ type: 'singleLine' }],
				}),
			];
			manager._templateRepo.save.mockImplementation(async (t: any) => t);
			manager._fieldRepo.save.mockResolvedValue(newFields);
			manager._fieldRepo.delete.mockResolvedValue({ affected: 2 });

			dataSource.transaction.mockImplementation(async (cb: any) =>
				cb(manager),
			);

			const result = await service.update({ id: tmpl.id, dto, orgId });

			expect(result.name).toBe('Renamed');
			expect(result.fields).toHaveLength(1);
			expect(result.fields[0].label).toBe('new-headline');
		});

		it('preserves field ids when payload fields carry their existing id (no rows deleted, no new rows inserted)', async () => {
			// Existing template has two fields with stable ids; payload
			// repeats both ids → service should update in place, never
			// delete-and-reinsert.
			const existingFieldA = createMockField({
				id: 'field-a',
				label: 'headline',
				position: 0,
				rules: [{ type: 'maxCharacters', value: 25 }],
			});
			const existingFieldB = createMockField({
				id: 'field-b',
				label: 'body',
				position: 1,
				rules: [{ type: 'maxWords', value: 30 }],
			});
			const tmpl = createMockTemplate({
				fields: [existingFieldA, existingFieldB],
			});
			templateRepo.findOne.mockResolvedValue(tmpl);

			const dto: UpdateTemplateDto = {
				name: 'Renamed',
				fields: [
					{
						id: 'field-a',
						label: 'headline-renamed',
						rules: [{ type: 'singleLine' }],
					},
					{
						id: 'field-b',
						label: 'body',
						rules: [{ type: 'maxWords', value: 50 }],
					},
				],
			} as UpdateTemplateDto;

			const manager = mockManager();
			manager._templateRepo.save.mockImplementation(async (t: any) => t);
			manager._fieldRepo.save.mockImplementation(
				async (rows: any) => rows,
			);
			manager._fieldRepo.delete.mockResolvedValue({ affected: 0 });

			dataSource.transaction.mockImplementation(async (cb: any) =>
				cb(manager),
			);

			const result = await service.update({
				id: tmpl.id,
				dto,
				orgId: tmpl.organizationId,
			});

			// Both existing field ids must survive the update.
			expect(result.fields.map((f) => f.id).sort()).toEqual([
				'field-a',
				'field-b',
			]);

			// fieldRepo.delete must NOT be called when nothing is removed.
			expect(manager._fieldRepo.delete).not.toHaveBeenCalled();

			// fieldRepo.save receives the SAME row references (in-place
			// update — id preserved).
			const savedRows = manager._fieldRepo.save.mock.calls[0][0];
			expect(savedRows).toHaveLength(2);
			const savedIds = savedRows.map((r: any) => r.id).sort();
			expect(savedIds).toEqual(['field-a', 'field-b']);

			// And the in-place update reflects the new label / rules.
			const rowA = savedRows.find((r: any) => r.id === 'field-a');
			expect(rowA.label).toBe('headline-renamed');
			expect(rowA.rules).toEqual([{ type: 'singleLine' }]);
		});

		it('inserts new fields and deletes existing fields the payload omits while preserving ids of the survivors', async () => {
			const existingFieldA = createMockField({
				id: 'field-a',
				label: 'headline',
				position: 0,
			});
			const existingFieldB = createMockField({
				id: 'field-b',
				label: 'body',
				position: 1,
			});
			const tmpl = createMockTemplate({
				fields: [existingFieldA, existingFieldB],
			});
			templateRepo.findOne.mockResolvedValue(tmpl);

			// Payload keeps field-a, drops field-b, adds a new field.
			const dto: UpdateTemplateDto = {
				name: 'Mixed',
				fields: [
					{
						id: 'field-a',
						label: 'headline',
						rules: [],
					},
					{
						label: 'new-cta',
						rules: [],
					},
				],
			} as UpdateTemplateDto;

			const manager = mockManager();
			manager._templateRepo.save.mockImplementation(async (t: any) => t);
			manager._fieldRepo.save.mockImplementation(async (rows: any) =>
				rows.map((r: any, i: number) => ({
					...r,
					id: r.id ?? `new-id-${i}`,
				})),
			);
			manager._fieldRepo.delete.mockResolvedValue({ affected: 1 });

			dataSource.transaction.mockImplementation(async (cb: any) =>
				cb(manager),
			);

			const result = await service.update({
				id: tmpl.id,
				dto,
				orgId: tmpl.organizationId,
			});

			// field-b is gone, field-a survives with its id, plus one new row.
			expect(result.fields).toHaveLength(2);
			expect(result.fields.find((f) => f.id === 'field-a')).toBeDefined();
			expect(
				result.fields.find((f) => f.id === 'field-b'),
			).toBeUndefined();

			// Delete was called with only the omitted id.
			expect(manager._fieldRepo.delete).toHaveBeenCalledWith(['field-b']);
		});

		it('throws NotFoundException for an id in a different org', async () => {
			templateRepo.findOne.mockResolvedValue(null);

			await expect(
				service.update({
					id: uuidv4(),
					orgId: uuidv4(),
					dto: buildCreateDto(),
				}),
			).rejects.toThrow(NotFoundException);

			// Transaction must NOT open if the existence check fails.
			expect(dataSource.transaction).not.toHaveBeenCalled();
		});
	});

	// -----------------------------------------------------------------------
	// delete
	// -----------------------------------------------------------------------
	describe('delete', () => {
		it('removes the template row (and cascades to fields via FK)', async () => {
			templateRepo.delete.mockResolvedValue({ affected: 1, raw: [] });

			await service.delete(uuidv4(), uuidv4());

			expect(templateRepo.delete).toHaveBeenCalled();
		});

		it('throws NotFoundException when the row is not found in this org', async () => {
			templateRepo.delete.mockResolvedValue({ affected: 0, raw: [] });

			await expect(service.delete(uuidv4(), uuidv4())).rejects.toThrow(
				NotFoundException,
			);
		});

		it('repeated delete returns NotFound (idempotent semantics)', async () => {
			templateRepo.delete
				.mockResolvedValueOnce({ affected: 1, raw: [] })
				.mockResolvedValueOnce({ affected: 0, raw: [] });

			const id = uuidv4();
			const orgId = uuidv4();
			await service.delete(id, orgId);
			await expect(service.delete(id, orgId)).rejects.toThrow(
				NotFoundException,
			);
		});
	});
});
