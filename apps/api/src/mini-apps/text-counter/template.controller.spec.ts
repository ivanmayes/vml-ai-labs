import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { v4 as uuidv4 } from 'uuid';

import { ResponseStatus } from '../../_platform/models';

import {
	CreateTemplateDto,
	TemplateResponseDto,
	UpdateTemplateDto,
} from './dtos';
import { TemplateService } from './services/template.service';
import { TemplateController } from './template.controller';

function mockReq(userId: string, orgId: string): any {
	return { user: { id: userId, organizationId: orgId } };
}

function buildResponse(
	overrides: Partial<TemplateResponseDto> = {},
): TemplateResponseDto {
	return {
		id: uuidv4(),
		organizationId: uuidv4(),
		createdById: uuidv4(),
		name: 'Holiday Carousel',
		fields: [
			{
				id: uuidv4(),
				label: 'headline',
				position: 0,
				rules: [{ type: 'maxCharacters', value: 25 }],
			},
		],
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

describe('TemplateController', () => {
	let controller: TemplateController;
	let service: jest.Mocked<TemplateService>;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [TemplateController],
			providers: [
				{
					provide: TemplateService,
					useValue: {
						findAll: jest.fn(),
						findOne: jest.fn(),
						create: jest.fn(),
						update: jest.fn(),
						delete: jest.fn(),
					},
				},
			],
		})
			.overrideGuard(AuthGuard('jwt'))
			.useValue({ canActivate: () => true })
			.compile();

		controller = module.get(TemplateController);
		service = module.get(TemplateService);
	});

	// -----------------------------------------------------------------------
	// GET /templates
	// -----------------------------------------------------------------------
	describe('list', () => {
		it('delegates to the service with the org id and wraps in envelope', async () => {
			const orgId = uuidv4();
			const templates = [buildResponse({ organizationId: orgId })];
			service.findAll.mockResolvedValue(templates);

			const result = await controller.list(orgId);

			expect(service.findAll).toHaveBeenCalledWith(orgId);
			expect(result.status).toBe(ResponseStatus.Success);
			expect(result.data).toBe(templates);
		});
	});

	// -----------------------------------------------------------------------
	// GET /templates/:id
	// -----------------------------------------------------------------------
	describe('get', () => {
		it('returns a single template wrapped in envelope', async () => {
			const orgId = uuidv4();
			const tmpl = buildResponse({ organizationId: orgId });
			service.findOne.mockResolvedValue(tmpl);

			const result = await controller.get(orgId, tmpl.id);

			expect(service.findOne).toHaveBeenCalledWith(tmpl.id, orgId);
			expect(result.data).toBe(tmpl);
		});

		it('propagates NotFoundException for cross-org lookups (404 not 403)', async () => {
			service.findOne.mockRejectedValue(
				new NotFoundException('Template not found'),
			);

			await expect(controller.get(uuidv4(), uuidv4())).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	// -----------------------------------------------------------------------
	// POST /templates
	// -----------------------------------------------------------------------
	describe('create', () => {
		it('forwards the user id, org id, and dto to the service', async () => {
			const orgId = uuidv4();
			const userId = uuidv4();
			const dto = {
				name: 'Holiday Carousel',
				fields: [
					{
						label: 'headline',
						rules: [{ type: 'maxCharacters', value: 25 }],
					},
				],
			} as CreateTemplateDto;
			const created = buildResponse({
				organizationId: orgId,
				createdById: userId,
			});
			service.create.mockResolvedValue(created);

			const result = await controller.create(
				mockReq(userId, orgId),
				orgId,
				dto,
			);

			expect(service.create).toHaveBeenCalledWith({
				dto,
				orgId,
				userId,
			});
			expect(result.data).toBe(created);
		});
	});

	// -----------------------------------------------------------------------
	// PUT /templates/:id
	// -----------------------------------------------------------------------
	describe('update', () => {
		it('forwards the id + dto to the service', async () => {
			const orgId = uuidv4();
			const id = uuidv4();
			const dto = {
				name: 'Renamed',
				fields: [
					{
						label: 'headline',
						rules: [],
					},
				],
			} as UpdateTemplateDto;
			const updated = buildResponse({ id, organizationId: orgId });
			service.update.mockResolvedValue(updated);

			const result = await controller.update(orgId, id, dto);

			expect(service.update).toHaveBeenCalledWith({ id, dto, orgId });
			expect(result.data).toBe(updated);
		});
	});

	// -----------------------------------------------------------------------
	// DELETE /templates/:id
	// -----------------------------------------------------------------------
	describe('delete', () => {
		it('returns success envelope on delete', async () => {
			service.delete.mockResolvedValue(undefined);

			const result = await controller.delete(uuidv4(), uuidv4());

			expect(result.status).toBe(ResponseStatus.Success);
		});

		it('propagates NotFoundException when service throws', async () => {
			service.delete.mockRejectedValue(
				new NotFoundException('Template not found'),
			);

			await expect(controller.delete(uuidv4(), uuidv4())).rejects.toThrow(
				NotFoundException,
			);
		});
	});

	// -----------------------------------------------------------------------
	// DTO validation (class-validator)
	// -----------------------------------------------------------------------
	describe('CreateTemplateDto validation', () => {
		async function validateDto(payload: unknown) {
			const instance = plainToInstance(CreateTemplateDto, payload);
			return validate(instance);
		}

		it('accepts a minimal valid payload', async () => {
			const errors = await validateDto({
				name: 'Headline check',
				fields: [
					{
						label: 'headline',
						rules: [{ type: 'maxCharacters', value: 25 }],
					},
				],
			});
			expect(errors).toHaveLength(0);
		});

		it('rejects an empty name', async () => {
			const errors = await validateDto({
				name: '',
				fields: [{ label: 'headline', rules: [] }],
			});
			expect(errors.length).toBeGreaterThan(0);
		});

		it('rejects a name longer than 255 chars', async () => {
			const errors = await validateDto({
				name: 'x'.repeat(256),
				fields: [{ label: 'headline', rules: [] }],
			});
			expect(errors.length).toBeGreaterThan(0);
		});

		it('rejects a name with leading whitespace', async () => {
			const errors = await validateDto({
				name: ' leading space',
				fields: [{ label: 'headline', rules: [] }],
			});
			expect(errors.length).toBeGreaterThan(0);
		});

		it('rejects a label containing a newline', async () => {
			const errors = await validateDto({
				name: 'tmpl',
				fields: [{ label: 'multi\nline', rules: [] }],
			});
			expect(errors.length).toBeGreaterThan(0);
		});

		it('rejects a label containing a null byte', async () => {
			const errors = await validateDto({
				name: 'tmpl',
				fields: [
					{ label: `null${String.fromCharCode(0)}byte`, rules: [] },
				],
			});
			expect(errors.length).toBeGreaterThan(0);
		});

		it('rejects a label longer than 255 chars', async () => {
			const errors = await validateDto({
				name: 'tmpl',
				fields: [{ label: 'x'.repeat(256), rules: [] }],
			});
			expect(errors.length).toBeGreaterThan(0);
		});

		it('rejects an empty fields array', async () => {
			const errors = await validateDto({
				name: 'tmpl',
				fields: [],
			});
			expect(errors.length).toBeGreaterThan(0);
		});

		it('rejects a rule with the wrong payload shape', async () => {
			const errors = await validateDto({
				name: 'tmpl',
				fields: [
					{
						label: 'headline',
						rules: [{ type: 'maxCharacters' }],
					},
				],
			});
			expect(errors.length).toBeGreaterThan(0);
		});

		it('rejects a forbiddenWords rule with 101 terms', async () => {
			const values = Array.from({ length: 101 }, (_, i) => `term${i}`);
			const errors = await validateDto({
				name: 'tmpl',
				fields: [
					{
						label: 'headline',
						rules: [{ type: 'forbiddenWords', values }],
					},
				],
			});
			expect(errors.length).toBeGreaterThan(0);
		});

		it('rejects a forbiddenWords term longer than 200 chars', async () => {
			const errors = await validateDto({
				name: 'tmpl',
				fields: [
					{
						label: 'headline',
						rules: [
							{
								type: 'forbiddenWords',
								values: ['x'.repeat(201)],
							},
						],
					},
				],
			});
			expect(errors.length).toBeGreaterThan(0);
		});

		it('accepts a singleLine rule (no payload)', async () => {
			const errors = await validateDto({
				name: 'tmpl',
				fields: [
					{
						label: 'headline',
						rules: [{ type: 'singleLine' }],
					},
				],
			});
			expect(errors).toHaveLength(0);
		});

		it('rejects an unknown rule type', async () => {
			const errors = await validateDto({
				name: 'tmpl',
				fields: [
					{
						label: 'headline',
						rules: [{ type: 'regex', pattern: '.*' }],
					},
				],
			});
			expect(errors.length).toBeGreaterThan(0);
		});
	});
});
