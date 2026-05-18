import {
	BadGatewayException,
	BadRequestException,
	NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { v4 as uuidv4 } from 'uuid';

import { ResponseStatus } from '../../_platform/models';

import { ExtractRequestDto } from './dtos';
import type {
	ExtractGeneralResponseDto,
	ExtractTemplateResponseDto,
} from './dtos/extract-response.dto';
import { ExtractionController } from './extraction.controller';
import { ExtractionService } from './services/extraction.service';

function fakeFile(): Express.Multer.File {
	const buffer = Buffer.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
	]);
	return {
		fieldname: 'file',
		originalname: 'creative.png',
		encoding: '7bit',
		mimetype: 'image/png',
		size: buffer.length,
		buffer,
		stream: null as unknown as Express.Multer.File['stream'],
		destination: '',
		filename: '',
		path: '',
	} as Express.Multer.File;
}

describe('ExtractionController', () => {
	let controller: ExtractionController;
	let extractionService: jest.Mocked<ExtractionService>;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			controllers: [ExtractionController],
			providers: [
				{
					provide: ExtractionService,
					useValue: {
						extract: jest.fn(),
					},
				},
			],
		})
			.overrideGuard(AuthGuard('jwt'))
			.useValue({ canActivate: () => true })
			.compile();

		controller = module.get(ExtractionController);
		extractionService = module.get(ExtractionService);
	});

	describe('POST /extract', () => {
		it('delegates to the service and wraps the result in an envelope', async () => {
			const orgId = uuidv4();
			const data: ExtractGeneralResponseDto = {
				regions: ['headline', 'body'],
			};
			extractionService.extract.mockResolvedValue(data);

			const result = await controller.extract(orgId, fakeFile(), {
				mode: 'general',
			} as ExtractRequestDto);

			expect(extractionService.extract).toHaveBeenCalledWith({
				dto: { mode: 'general' },
				orgId,
				file: expect.objectContaining({ originalname: 'creative.png' }),
			});
			expect(result.status).toBe(ResponseStatus.Success);
			expect(result.data).toBe(data);
		});

		it('throws BadRequestException when no file is uploaded', async () => {
			await expect(
				controller.extract(
					uuidv4(),
					undefined as unknown as Express.Multer.File,
					{ mode: 'general' } as ExtractRequestDto,
				),
			).rejects.toThrow(BadRequestException);
		});

		it('propagates NotFoundException for a missing template (404)', async () => {
			extractionService.extract.mockRejectedValue(
				new NotFoundException('Template not found'),
			);

			await expect(
				controller.extract(uuidv4(), fakeFile(), {
					mode: 'template',
					templateId: uuidv4(),
				} as ExtractRequestDto),
			).rejects.toThrow(NotFoundException);
		});

		it('propagates BadGatewayException when the AI parse fails', async () => {
			extractionService.extract.mockRejectedValue(
				new BadGatewayException(
					'Text extraction failed — the vision provider returned an unexpected response.',
				),
			);

			await expect(
				controller.extract(uuidv4(), fakeFile(), {
					mode: 'general',
				} as ExtractRequestDto),
			).rejects.toThrow(BadGatewayException);
		});

		it('returns the template-mode shape from the service unchanged', async () => {
			const data: ExtractTemplateResponseDto = {
				matches: [
					{ label: 'headline', text: 'BIG SALE' },
					{ label: 'body', text: '' },
				],
				unassigned: ['Watermark'],
			};
			extractionService.extract.mockResolvedValue(data);

			const result = await controller.extract(uuidv4(), fakeFile(), {
				mode: 'template',
				templateId: uuidv4(),
			} as ExtractRequestDto);

			expect(result.data).toBe(data);
		});
	});

	// -----------------------------------------------------------------------
	// DTO validation (class-validator)
	// -----------------------------------------------------------------------
	describe('ExtractRequestDto validation', () => {
		async function validateDto(payload: unknown) {
			const instance = plainToInstance(ExtractRequestDto, payload);
			return validate(instance);
		}

		it('accepts a general-mode payload without templateId', async () => {
			const errors = await validateDto({ mode: 'general' });
			expect(errors).toHaveLength(0);
		});

		it('accepts a template-mode payload with a valid templateId', async () => {
			const errors = await validateDto({
				mode: 'template',
				templateId: uuidv4(),
			});
			expect(errors).toHaveLength(0);
		});

		it('rejects a template-mode payload without templateId', async () => {
			const errors = await validateDto({ mode: 'template' });
			expect(errors.length).toBeGreaterThan(0);
		});

		it('rejects a template-mode payload with a non-uuid templateId', async () => {
			const errors = await validateDto({
				mode: 'template',
				templateId: 'not-a-uuid',
			});
			expect(errors.length).toBeGreaterThan(0);
		});

		it('rejects an unknown mode', async () => {
			const errors = await validateDto({ mode: 'unknown' });
			expect(errors.length).toBeGreaterThan(0);
		});

		it('rejects a missing mode', async () => {
			const errors = await validateDto({});
			expect(errors.length).toBeGreaterThan(0);
		});

		it('rejects a non-uuid templateId even in general mode (defensive)', async () => {
			const errors = await validateDto({
				mode: 'general',
				templateId: 'not-a-uuid',
			});
			expect(errors.length).toBeGreaterThan(0);
		});
	});
});
