/**
 * Pure JSON parser + shape validator for the vision provider's
 * response body. Split out from the extraction service so the
 * JSON-shape edge cases (code fences, missing keys, plain-text
 * non-JSON) can be unit-tested without touching the AI client.
 *
 * Top-level extra keys are tolerated (we ignore them) — the parser
 * just returns whatever shape parsed. For template mode the service
 * is responsible for filling in any template fields the model
 * omitted from `matches`; the parser does NOT pad the response.
 */

import type {
	ExtractGeneralResponseDto,
	ExtractMatchDto,
	ExtractResponseDto,
	ExtractTemplateResponseDto,
} from '../dtos/extract-response.dto';
import type { ExtractMode } from '../dtos/extract-request.dto';

export class ExtractionParseError extends Error {
	readonly raw: string;

	constructor(message: string, raw: string) {
		super(message);
		this.name = 'ExtractionParseError';
		this.raw = raw;
	}
}

/**
 * Strip a leading ```json / ``` code fence and trailing ``` from a
 * vision response that ignored the system-prompt instruction.
 * Whitespace around the fences is forgiven. If the body is not
 * code-fence-wrapped, it is returned unchanged.
 */
function stripCodeFences(raw: string): string {
	const trimmed = raw.trim();
	const fenceMatch = trimmed.match(
		/^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```$/,
	);
	if (fenceMatch) {
		return fenceMatch[1].trim();
	}
	return trimmed;
}

function ensureArrayOfStrings(
	value: unknown,
	key: string,
	raw: string,
): string[] {
	if (!Array.isArray(value)) {
		throw new ExtractionParseError(
			`Expected '${key}' to be an array of strings`,
			raw,
		);
	}
	for (const v of value) {
		if (typeof v !== 'string') {
			throw new ExtractionParseError(
				`Expected '${key}' to contain only strings`,
				raw,
			);
		}
	}
	return value as string[];
}

function ensureMatches(value: unknown, raw: string): ExtractMatchDto[] {
	if (!Array.isArray(value)) {
		throw new ExtractionParseError(
			"Expected 'matches' to be an array of {label, text} objects",
			raw,
		);
	}
	const out: ExtractMatchDto[] = [];
	for (const entry of value) {
		if (
			!entry ||
			typeof entry !== 'object' ||
			typeof (entry as Record<string, unknown>).label !== 'string' ||
			typeof (entry as Record<string, unknown>).text !== 'string'
		) {
			throw new ExtractionParseError(
				"Expected each 'matches' entry to be { label: string, text: string }",
				raw,
			);
		}
		out.push({
			label: (entry as Record<string, unknown>).label as string,
			text: (entry as Record<string, unknown>).text as string,
		});
	}
	return out;
}

function parseGeneral(parsed: unknown, raw: string): ExtractGeneralResponseDto {
	if (!parsed || typeof parsed !== 'object') {
		throw new ExtractionParseError(
			'Expected a JSON object at the top level',
			raw,
		);
	}
	const obj = parsed as Record<string, unknown>;
	if (!('regions' in obj)) {
		throw new ExtractionParseError("Missing 'regions' key", raw);
	}
	const regions = ensureArrayOfStrings(obj.regions, 'regions', raw);
	return { regions };
}

function parseTemplate(
	parsed: unknown,
	raw: string,
): ExtractTemplateResponseDto {
	if (!parsed || typeof parsed !== 'object') {
		throw new ExtractionParseError(
			'Expected a JSON object at the top level',
			raw,
		);
	}
	const obj = parsed as Record<string, unknown>;
	if (!('matches' in obj)) {
		throw new ExtractionParseError("Missing 'matches' key", raw);
	}
	if (!('unassigned' in obj)) {
		throw new ExtractionParseError("Missing 'unassigned' key", raw);
	}
	const matches = ensureMatches(obj.matches, raw);
	const unassigned = ensureArrayOfStrings(obj.unassigned, 'unassigned', raw);
	return { matches, unassigned };
}

/**
 * Parse and validate the vision provider's raw text response into
 * the right `ExtractResponseDto` shape for the requested mode.
 *
 * Throws `ExtractionParseError` on:
 *  - non-JSON or empty text
 *  - top-level shape mismatch (missing required keys, wrong types)
 *
 * Tolerated:
 *  - leading/trailing whitespace
 *  - ```json ... ``` code-fence wrappers
 *  - extra unknown top-level keys
 */
export function parseExtractionResponse(
	rawText: string,
	mode: ExtractMode,
): ExtractResponseDto {
	if (typeof rawText !== 'string' || rawText.trim() === '') {
		throw new ExtractionParseError(
			'Vision response was empty',
			rawText ?? '',
		);
	}

	const stripped = stripCodeFences(rawText);

	let parsed: unknown;
	try {
		parsed = JSON.parse(stripped);
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		throw new ExtractionParseError(
			`Vision response was not valid JSON: ${reason}`,
			rawText,
		);
	}

	return mode === 'template'
		? parseTemplate(parsed, rawText)
		: parseGeneral(parsed, rawText);
}
