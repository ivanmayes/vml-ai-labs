/**
 * Vision-based text extraction service.
 *
 * Orchestrates the U3 extract flow:
 *
 *   1. Validate the uploaded file (size, mime, magic bytes — reused
 *      from `_platform/files`).
 *   2. If template mode, fetch the template by id + org id. Cross-org
 *      reads return 404 (existence is not leaked).
 *   3. Build the system + user prompt via the pure builder.
 *   4. Call `AIService.analyzeImage` — no provider/model override, the
 *      service resolves the configured `AIModality.Vision` default.
 *   5. Parse and shape-validate the response via the pure parser.
 *   6. For template mode, ensure every template field appears in
 *      `matches`; fill any missing field with empty text (the parser
 *      is intentionally shape-tolerant here, the service fills).
 *   7. Drop the buffer reference and return — no DB writes, no
 *      persistence (R7 / AE9).
 *
 * Parse failures from the AI surface as `BadGatewayException` (502)
 * with a generic message; the raw AI text is logged at debug level
 * only.
 */

import { BadGatewayException, Injectable, Logger } from '@nestjs/common';

import { AIService } from '../../../ai/ai.service';
import { ImageFileValidationService } from '../../../_platform/files';
import type { ValidatedImage } from '../../../_platform/files';
import type { ExtractRequestDto } from '../dtos/extract-request.dto';
import type {
	ExtractMatchDto,
	ExtractResponseDto,
	ExtractTemplateResponseDto,
} from '../dtos/extract-response.dto';
import type { TemplateResponseDto } from '../dtos/template-response.dto';

import {
	ExtractionParseError,
	parseExtractionResponse,
} from './extraction-response-parser';
import { buildPrompt } from './vision-prompt-builder';
import { TemplateService } from './template.service';

interface ExtractInput {
	dto: ExtractRequestDto;
	orgId: string;
	file: Express.Multer.File;
}

const AI_PARSE_FAILURE_MESSAGE =
	'Text extraction failed — the vision provider returned an unexpected response.';

@Injectable()
export class ExtractionService {
	private readonly logger = new Logger(ExtractionService.name);

	constructor(
		private readonly imageFileValidationService: ImageFileValidationService,
		private readonly templateService: TemplateService,
		private readonly aiService: AIService,
	) {}

	async extract(input: ExtractInput): Promise<ExtractResponseDto> {
		const { dto, orgId, file } = input;

		// 1. Validate the file. Domain errors propagate as-is and the
		// controller maps them to HTTP responses.
		const validated: ValidatedImage =
			await this.imageFileValidationService.validateFile(file);

		// 2. Template lookup (404 on cross-org / deleted — avoid existence
		// leak). TemplateService.findOne already throws NotFoundException
		// for both cases.
		let template: TemplateResponseDto | undefined;
		if (dto.mode === 'template') {
			// `templateId` is guaranteed to be present here by class-validator
			// (see ExtractRequestDto), but TypeScript can't see that — assert.
			template = await this.templateService.findOne(
				dto.templateId as string,
				orgId,
			);
		}

		// 3. Build prompt.
		const prompt = buildPrompt(dto.mode, template);

		// 4. Vision call. Base64-encode the buffer and hand it off.
		const base64 = validated.buffer.toString('base64');
		const aiResponse = await this.aiService.analyzeImage({
			images: [{ base64, mimeType: validated.mimeType }],
			prompt,
		});

		// 5. Parse + shape-validate.
		let parsed: ExtractResponseDto;
		try {
			parsed = parseExtractionResponse(aiResponse.content, dto.mode);
		} catch (err) {
			if (err instanceof ExtractionParseError) {
				// Log raw text at debug level only — never at error level —
				// because the raw AI text may contain the extracted content
				// itself, and the privacy posture says we don't persist or
				// loudly log user content.
				this.logger.debug(
					`Vision response parse failure: ${err.message}; raw=${err.raw}`,
				);
				throw new BadGatewayException(AI_PARSE_FAILURE_MESSAGE);
			}
			throw err;
		}

		// 6. For template mode, fill in any fields the model omitted from
		// `matches` with empty text. The parser is intentionally
		// shape-tolerant; the service owns the "must have every field"
		// guarantee so the parser can stay a pure JSON validator.
		let result = parsed;
		if (dto.mode === 'template' && template) {
			result = this.normalizeTemplateResponse(
				parsed as ExtractTemplateResponseDto,
				template,
			);
		}

		// 7. Drop our local reference to the buffer. Node/V8 won't reclaim
		// memory until the request scope itself ends, but explicitly
		// dropping the reference here makes the privacy intent obvious to
		// future readers (and to security review).
		(validated as { buffer?: Buffer }).buffer = undefined;

		return result;
	}

	/**
	 * Ensure every template field has a `matches` entry. If the model
	 * returned multiple matches with the same label, keep the first;
	 * extras get pushed onto `unassigned` so no extracted text is
	 * silently dropped.
	 *
	 * Labels in the model's response that don't correspond to any
	 * template field are also moved to `unassigned`.
	 */
	private normalizeTemplateResponse(
		parsed: ExtractTemplateResponseDto,
		template: TemplateResponseDto,
	): ExtractTemplateResponseDto {
		const orderedFields = [...template.fields].sort(
			(a, b) => a.position - b.position,
		);
		const wantedLabels = new Set(orderedFields.map((f) => f.label));

		// Take the first match per label.
		const byLabel = new Map<string, string>();
		const extraUnassigned: string[] = [];
		for (const m of parsed.matches) {
			if (!wantedLabels.has(m.label)) {
				// Unknown label → push the text into unassigned rather than
				// silently dropping it.
				if (m.text) extraUnassigned.push(m.text);
				continue;
			}
			if (byLabel.has(m.label)) {
				// Duplicate match for the same field → keep the first, push
				// extras to unassigned (preserves user-visible content).
				if (m.text) extraUnassigned.push(m.text);
				continue;
			}
			byLabel.set(m.label, m.text);
		}

		const matches: ExtractMatchDto[] = orderedFields.map((field) => ({
			label: field.label,
			text: byLabel.get(field.label) ?? '',
		}));

		return {
			matches,
			unassigned: [...parsed.unassigned, ...extraUnassigned],
		};
	}
}
