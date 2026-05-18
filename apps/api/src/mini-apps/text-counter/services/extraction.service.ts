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
 * only. Provider-level errors map to specific statuses:
 *
 *   - `AIRateLimitError`  → 429 Too Many Requests
 *   - `AITimeoutError`    → 504 Gateway Timeout
 *   - `AIProviderError`   → 502 Bad Gateway
 */

import {
	BadGatewayException,
	GatewayTimeoutException,
	HttpException,
	Injectable,
	Logger,
} from '@nestjs/common';

import {
	AIProviderError,
	AIRateLimitError,
	AIService,
	AITimeoutError,
} from '../../../ai';
import type { AIVisionResponse } from '../../../ai';
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
const AI_RATE_LIMIT_MESSAGE =
	'Text extraction is temporarily rate-limited. Try again in a moment.';
const AI_TIMEOUT_MESSAGE =
	'Text extraction timed out waiting on the vision provider. Try again.';
const AI_PROVIDER_FAILURE_MESSAGE =
	'Text extraction failed — the vision provider is currently unavailable.';

/**
 * Truncate `templateId` for log fields. We never want to dump the full
 * id (cheap pivot to scrape org content via log grep) but a short
 * prefix is useful when correlating with traces.
 */
function templateIdHint(templateId: string | undefined): string | undefined {
	if (!templateId) return undefined;
	return templateId.slice(0, 8);
}

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

		// 4. Vision call. Base64-encode the buffer and hand it off. Map
		// provider-level errors to specific HTTP statuses so callers can
		// distinguish "try again later" (429) from "the upstream is
		// timing out" (504) from "the upstream is broken" (502). Without
		// this catch all three bubble as 500s from Nest's default
		// handler.
		const base64 = validated.buffer.toString('base64');
		let aiResponse: AIVisionResponse;
		try {
			aiResponse = await this.aiService.analyzeImage({
				images: [{ base64, mimeType: validated.mimeType }],
				prompt,
			});
		} catch (err) {
			// handleAiError always throws; the `never` return type lets TS
			// narrow `aiResponse` as defined below.
			this.handleAiError(err, dto, orgId);
		}

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
	 * Map a thrown AI-provider error to the appropriate HTTP status:
	 *
	 *   - `AIRateLimitError`  → 429 Too Many Requests
	 *   - `AITimeoutError`    → 504 Gateway Timeout
	 *   - `AIProviderError`   → 502 Bad Gateway
	 *
	 * Anything else is rethrown for the default Nest exception filter
	 * to handle (500 by default).
	 *
	 * Provider error messages may include API keys, prompt fragments, or
	 * snippets of the user's extracted content (the upstream often
	 * echoes parts of the request) — never propagate them to the
	 * client. Log at warn with structured, non-content fields only.
	 *
	 * Declared `never` so the caller's narrow tracks that this either
	 * throws or rethrows.
	 */
	private handleAiError(
		err: unknown,
		dto: ExtractRequestDto,
		orgId: string,
	): never {
		const meta = {
			orgId,
			mode: dto.mode,
			templateIdHint: templateIdHint(dto.templateId),
			name: (err as { name?: string })?.name,
		};

		if (err instanceof AIRateLimitError) {
			this.logger.warn(
				`Vision provider rate-limited: ${JSON.stringify(meta)}`,
			);
			throw new HttpException(AI_RATE_LIMIT_MESSAGE, 429);
		}
		if (err instanceof AITimeoutError) {
			this.logger.warn(
				`Vision provider timed out: ${JSON.stringify(meta)}`,
			);
			throw new GatewayTimeoutException(AI_TIMEOUT_MESSAGE);
		}
		if (err instanceof AIProviderError) {
			this.logger.warn(`Vision provider error: ${JSON.stringify(meta)}`);
			throw new BadGatewayException(AI_PROVIDER_FAILURE_MESSAGE);
		}
		throw err;
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
