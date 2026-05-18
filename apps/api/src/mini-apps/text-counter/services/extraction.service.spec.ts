import {
	BadGatewayException,
	GatewayTimeoutException,
	HttpException,
	NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { v4 as uuidv4 } from 'uuid';

import {
	AIProviderError,
	AIRateLimitError,
	AIService,
	AITimeoutError,
} from '../../../ai';
import { ImageFileValidationService } from '../../../_platform/files';
import {
	HeicNotSupportedError,
	FileTooLargeError,
	InvalidFileTypeError,
} from '../../../_platform/errors/domain.errors';
import type {
	ExtractGeneralResponseDto,
	ExtractTemplateResponseDto,
} from '../dtos/extract-response.dto';
import type { TemplateResponseDto } from '../dtos/template-response.dto';

import { ExtractionService } from './extraction.service';
import { TemplateService } from './template.service';

/**
 * Minimal valid PNG header buffer plus enough trailing bytes that the
 * validator's size sanity check is happy. The actual byte content
 * doesn't matter for the service tests — `ImageFileValidationService`
 * is mocked.
 */
function fakePngBuffer(): Buffer {
	return Buffer.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
	]);
}

function fakeMulterFile(
	overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
	const buffer = overrides.buffer ?? fakePngBuffer();
	return {
		fieldname: 'file',
		originalname: 'test.png',
		encoding: '7bit',
		mimetype: 'image/png',
		size: buffer.length,
		buffer,
		stream: null as unknown as Express.Multer.File['stream'],
		destination: '',
		filename: '',
		path: '',
		...overrides,
	} as Express.Multer.File;
}

function buildTemplate(labels: string[], orgId: string): TemplateResponseDto {
	return {
		id: uuidv4(),
		organizationId: orgId,
		createdById: uuidv4(),
		name: 'Holiday Carousel',
		fields: labels.map((label, idx) => ({
			id: uuidv4(),
			label,
			position: idx,
			rules: [],
		})),
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

describe('ExtractionService', () => {
	let service: ExtractionService;
	let imageFileValidationService: jest.Mocked<ImageFileValidationService>;
	let templateService: jest.Mocked<TemplateService>;
	let aiService: jest.Mocked<AIService>;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ExtractionService,
				{
					provide: ImageFileValidationService,
					useValue: {
						validateFile: jest.fn(),
					},
				},
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
				{
					provide: AIService,
					useValue: {
						analyzeImage: jest.fn(),
					},
				},
			],
		}).compile();

		service = module.get(ExtractionService);
		imageFileValidationService = module.get(ImageFileValidationService);
		templateService = module.get(TemplateService);
		aiService = module.get(AIService);

		// Default happy-path validation: returns a synthetic ValidatedImage.
		imageFileValidationService.validateFile.mockImplementation(
			async (file: Express.Multer.File) => ({
				buffer: file.buffer,
				originalName: file.originalname,
				sanitizedName: file.originalname,
				extension: '.png',
				mimeType: 'image/png',
				size: file.buffer.length,
			}),
		);
	});

	// ---------------------------------------------------------------------
	// AE1 — general mode
	// ---------------------------------------------------------------------
	describe('general mode (AE1)', () => {
		it('returns the regions list the AI surfaced', async () => {
			aiService.analyzeImage.mockResolvedValue({
				content: JSON.stringify({
					regions: ['HEADLINE', 'Body copy', 'Visit example.com'],
				}),
				finishReason: 'stop',
			} as never);

			const result = (await service.extract({
				dto: { mode: 'general' },
				orgId: uuidv4(),
				file: fakeMulterFile(),
			})) as ExtractGeneralResponseDto;

			expect(result.regions).toEqual([
				'HEADLINE',
				'Body copy',
				'Visit example.com',
			]);
			expect(templateService.findOne).not.toHaveBeenCalled();
		});

		it('does not pass a provider or model override to analyzeImage', async () => {
			aiService.analyzeImage.mockResolvedValue({
				content: '{"regions":[]}',
				finishReason: 'stop',
			} as never);

			await service.extract({
				dto: { mode: 'general' },
				orgId: uuidv4(),
				file: fakeMulterFile(),
			});

			const [req, config] = aiService.analyzeImage.mock.calls[0];
			expect(req.provider).toBeUndefined();
			expect(req.model).toBeUndefined();
			expect(config).toBeUndefined();
			expect(req.images).toHaveLength(1);
			expect(req.images[0].mimeType).toBe('image/png');
			expect(req.images[0].base64).toBeDefined();
			expect(req.prompt).toContain('"regions"');
		});

		it('does not persist anything (privacy assertion, AE9)', async () => {
			aiService.analyzeImage.mockResolvedValue({
				content: '{"regions":["x"]}',
				finishReason: 'stop',
			} as never);

			await service.extract({
				dto: { mode: 'general' },
				orgId: uuidv4(),
				file: fakeMulterFile(),
			});

			expect(templateService.create).not.toHaveBeenCalled();
			expect(templateService.update).not.toHaveBeenCalled();
			expect(templateService.delete).not.toHaveBeenCalled();
		});
	});

	// ---------------------------------------------------------------------
	// AE2 — template mode
	// ---------------------------------------------------------------------
	describe('template mode (AE2)', () => {
		it('returns every template field in matches plus any extras in unassigned', async () => {
			const orgId = uuidv4();
			const template = buildTemplate(
				['headline', 'body', 'cta', 'disclaimer'],
				orgId,
			);
			templateService.findOne.mockResolvedValue(template);

			aiService.analyzeImage.mockResolvedValue({
				content: JSON.stringify({
					matches: [
						{ label: 'headline', text: 'BIG SALE' },
						{ label: 'body', text: 'Today only' },
						{ label: 'cta', text: 'Shop now' },
						{ label: 'disclaimer', text: 'Terms apply' },
					],
					unassigned: ['Background watermark'],
				}),
				finishReason: 'stop',
			} as never);

			const result = (await service.extract({
				dto: { mode: 'template', templateId: template.id },
				orgId,
				file: fakeMulterFile(),
			})) as ExtractTemplateResponseDto;

			expect(result.matches).toEqual([
				{ label: 'headline', text: 'BIG SALE' },
				{ label: 'body', text: 'Today only' },
				{ label: 'cta', text: 'Shop now' },
				{ label: 'disclaimer', text: 'Terms apply' },
			]);
			expect(result.unassigned).toEqual(['Background watermark']);
			expect(templateService.findOne).toHaveBeenCalledWith(
				template.id,
				orgId,
			);
		});

		it('fills missing fields with empty text when the AI omits them', async () => {
			const orgId = uuidv4();
			const template = buildTemplate(
				['headline', 'body', 'cta', 'disclaimer'],
				orgId,
			);
			templateService.findOne.mockResolvedValue(template);

			aiService.analyzeImage.mockResolvedValue({
				content: JSON.stringify({
					matches: [
						{ label: 'headline', text: 'BIG SALE' },
						{ label: 'body', text: 'Today only' },
					],
					unassigned: [],
				}),
				finishReason: 'stop',
			} as never);

			const result = (await service.extract({
				dto: { mode: 'template', templateId: template.id },
				orgId,
				file: fakeMulterFile(),
			})) as ExtractTemplateResponseDto;

			expect(result.matches).toEqual([
				{ label: 'headline', text: 'BIG SALE' },
				{ label: 'body', text: 'Today only' },
				{ label: 'cta', text: '' },
				{ label: 'disclaimer', text: '' },
			]);
		});

		it('pushes a duplicate-label match into unassigned and keeps the first', async () => {
			const orgId = uuidv4();
			const template = buildTemplate(['headline', 'body'], orgId);
			templateService.findOne.mockResolvedValue(template);

			aiService.analyzeImage.mockResolvedValue({
				content: JSON.stringify({
					matches: [
						{ label: 'headline', text: 'FIRST' },
						{ label: 'headline', text: 'SECOND' },
						{ label: 'body', text: 'Body' },
					],
					unassigned: [],
				}),
				finishReason: 'stop',
			} as never);

			const result = (await service.extract({
				dto: { mode: 'template', templateId: template.id },
				orgId,
				file: fakeMulterFile(),
			})) as ExtractTemplateResponseDto;

			expect(result.matches).toEqual([
				{ label: 'headline', text: 'FIRST' },
				{ label: 'body', text: 'Body' },
			]);
			expect(result.unassigned).toEqual(['SECOND']);
		});

		it('moves a match with an unknown label into unassigned', async () => {
			const orgId = uuidv4();
			const template = buildTemplate(['headline', 'body'], orgId);
			templateService.findOne.mockResolvedValue(template);

			aiService.analyzeImage.mockResolvedValue({
				content: JSON.stringify({
					matches: [
						{ label: 'headline', text: 'H' },
						{ label: 'hallucinated-label', text: 'Extra text' },
					],
					unassigned: [],
				}),
				finishReason: 'stop',
			} as never);

			const result = (await service.extract({
				dto: { mode: 'template', templateId: template.id },
				orgId,
				file: fakeMulterFile(),
			})) as ExtractTemplateResponseDto;

			expect(result.matches).toEqual([
				{ label: 'headline', text: 'H' },
				{ label: 'body', text: '' },
			]);
			expect(result.unassigned).toEqual(['Extra text']);
		});

		it('propagates NotFoundException when the template is missing (404, not 403)', async () => {
			templateService.findOne.mockRejectedValue(
				new NotFoundException('Template not found'),
			);

			await expect(
				service.extract({
					dto: { mode: 'template', templateId: uuidv4() },
					orgId: uuidv4(),
					file: fakeMulterFile(),
				}),
			).rejects.toThrow(NotFoundException);

			expect(aiService.analyzeImage).not.toHaveBeenCalled();
		});

		it('builds a template-mode prompt with the field labels as a JSON array literal', async () => {
			const orgId = uuidv4();
			const template = buildTemplate(['headline', 'body'], orgId);
			templateService.findOne.mockResolvedValue(template);
			aiService.analyzeImage.mockResolvedValue({
				content: '{"matches":[],"unassigned":[]}',
				finishReason: 'stop',
			} as never);

			await service.extract({
				dto: { mode: 'template', templateId: template.id },
				orgId,
				file: fakeMulterFile(),
			});

			const [req] = aiService.analyzeImage.mock.calls[0];
			expect(req.prompt).toContain('Fields: ["headline","body"]');
		});
	});

	// ---------------------------------------------------------------------
	// File validation
	// ---------------------------------------------------------------------
	describe('file validation rejections', () => {
		it('propagates HEIC rejection from the validator', async () => {
			imageFileValidationService.validateFile.mockRejectedValue(
				new HeicNotSupportedError(),
			);

			await expect(
				service.extract({
					dto: { mode: 'general' },
					orgId: uuidv4(),
					file: fakeMulterFile(),
				}),
			).rejects.toThrow(HeicNotSupportedError);

			expect(aiService.analyzeImage).not.toHaveBeenCalled();
		});

		it('propagates oversize rejection from the validator', async () => {
			imageFileValidationService.validateFile.mockRejectedValue(
				new FileTooLargeError(26 * 1024 * 1024, 25 * 1024 * 1024),
			);

			await expect(
				service.extract({
					dto: { mode: 'general' },
					orgId: uuidv4(),
					file: fakeMulterFile(),
				}),
			).rejects.toThrow(FileTooLargeError);

			expect(aiService.analyzeImage).not.toHaveBeenCalled();
		});

		it('propagates unsupported-type rejection (e.g. PDF) from the validator', async () => {
			imageFileValidationService.validateFile.mockRejectedValue(
				new InvalidFileTypeError(),
			);

			await expect(
				service.extract({
					dto: { mode: 'general' },
					orgId: uuidv4(),
					file: fakeMulterFile(),
				}),
			).rejects.toThrow(InvalidFileTypeError);
		});
	});

	// ---------------------------------------------------------------------
	// AI parse failure → 502
	// ---------------------------------------------------------------------
	describe('AI response parse failure', () => {
		it('throws BadGatewayException when the AI response is not valid JSON', async () => {
			aiService.analyzeImage.mockResolvedValue({
				content: "I'm sorry, I can't help with that.",
				finishReason: 'stop',
			} as never);

			await expect(
				service.extract({
					dto: { mode: 'general' },
					orgId: uuidv4(),
					file: fakeMulterFile(),
				}),
			).rejects.toThrow(BadGatewayException);
		});

		it('uses a generic message rather than leaking raw AI text', async () => {
			aiService.analyzeImage.mockResolvedValue({
				content: 'extracted user content here, not JSON',
				finishReason: 'stop',
			} as never);

			try {
				await service.extract({
					dto: { mode: 'general' },
					orgId: uuidv4(),
					file: fakeMulterFile(),
				});
				fail('should have thrown');
			} catch (err) {
				expect(err).toBeInstanceOf(BadGatewayException);
				const msg = (err as BadGatewayException).message;
				expect(msg).not.toContain('extracted user content');
				expect(msg).toMatch(/extraction failed/i);
			}
		});

		it('throws BadGatewayException when the AI response is JSON but the wrong shape', async () => {
			aiService.analyzeImage.mockResolvedValue({
				content: '{"unrelated":"shape"}',
				finishReason: 'stop',
			} as never);

			await expect(
				service.extract({
					dto: { mode: 'general' },
					orgId: uuidv4(),
					file: fakeMulterFile(),
				}),
			).rejects.toThrow(BadGatewayException);
		});

		it('strips ```json fences before parsing on success', async () => {
			aiService.analyzeImage.mockResolvedValue({
				content: '```json\n{"regions":["A","B"]}\n```',
				finishReason: 'stop',
			} as never);

			const result = (await service.extract({
				dto: { mode: 'general' },
				orgId: uuidv4(),
				file: fakeMulterFile(),
			})) as ExtractGeneralResponseDto;

			expect(result.regions).toEqual(['A', 'B']);
		});
	});

	// ---------------------------------------------------------------------
	// AI provider error → HTTP status mapping (Fix 1)
	// ---------------------------------------------------------------------
	describe('AI provider error mapping', () => {
		it('maps AIRateLimitError to 429 Too Many Requests with a generic message', async () => {
			aiService.analyzeImage.mockRejectedValue(
				new AIRateLimitError('upstream key abc123 rate-limited', {
					retryAfter: 30,
				}),
			);

			try {
				await service.extract({
					dto: { mode: 'general' },
					orgId: uuidv4(),
					file: fakeMulterFile(),
				});
				fail('should have thrown');
			} catch (err) {
				expect(err).toBeInstanceOf(HttpException);
				expect((err as HttpException).getStatus()).toBe(429);
				const msg = (err as HttpException).message;
				expect(msg).not.toContain('abc123');
				expect(msg).toMatch(/rate-limited/i);
			}
		});

		it('maps AITimeoutError to 504 Gateway Timeout with a generic message', async () => {
			aiService.analyzeImage.mockRejectedValue(
				new AITimeoutError('upstream timed out talking to provider X', {
					timeoutMs: 30000,
				}),
			);

			try {
				await service.extract({
					dto: { mode: 'general' },
					orgId: uuidv4(),
					file: fakeMulterFile(),
				});
				fail('should have thrown');
			} catch (err) {
				expect(err).toBeInstanceOf(GatewayTimeoutException);
				expect((err as GatewayTimeoutException).getStatus()).toBe(504);
				const msg = (err as GatewayTimeoutException).message;
				expect(msg).not.toContain('provider X');
				expect(msg).toMatch(/timed out/i);
			}
		});

		it('maps AIProviderError to 502 Bad Gateway with a generic message', async () => {
			aiService.analyzeImage.mockRejectedValue(
				new AIProviderError('upstream 500 - internal trace abc/xyz', {
					statusCode: 500,
					providerCode: 'internal_error',
				}),
			);

			try {
				await service.extract({
					dto: { mode: 'general' },
					orgId: uuidv4(),
					file: fakeMulterFile(),
				});
				fail('should have thrown');
			} catch (err) {
				expect(err).toBeInstanceOf(BadGatewayException);
				expect((err as BadGatewayException).getStatus()).toBe(502);
				const msg = (err as BadGatewayException).message;
				expect(msg).not.toContain('abc/xyz');
				expect(msg).not.toContain('internal trace');
				expect(msg).toMatch(/unavailable/i);
			}
		});
	});
});
