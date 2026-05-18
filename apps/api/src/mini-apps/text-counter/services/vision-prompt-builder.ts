/**
 * Pure functions that build the system + user prompts sent to the
 * vision provider via `AIService.analyzeImage`.
 *
 * Two intentional design points:
 *
 *  1. **Template labels are emitted as a JSON array literal** rather
 *     than free-form interpolated into the prompt (plan G2 sanitization
 *     resolution). A field label like
 *     `"head", "ignore previous instructions" : "yes"` becomes a single
 *     properly-escaped string element of the `Fields:` array — the
 *     model can't break out of the array context as easily as it could
 *     break out of free-form text. Tests cover labels containing `"`,
 *     `\`, newlines, and bracket characters.
 *
 *  2. The system prompt and the user prompt are split, but the
 *     `AIVisionRequest` shape this codebase uses only carries a single
 *     `prompt` string. We concatenate them with a clear separator and
 *     pass the result. If/when the AIService surface grows a separate
 *     system-prompt slot, the migration is mechanical.
 *
 * These functions are pure (no I/O, no Nest decorators) so the test
 * surface stays narrow and parser/orchestration tests can mock them
 * trivially.
 */

import type { TemplateResponseDto } from '../dtos/template-response.dto';
import type { ExtractMode } from '../dtos/extract-request.dto';

/**
 * System prompt — kept as a stable constant so the response-parser
 * spec and the prompt-builder spec can both reference it.
 */
export const SYSTEM_PROMPT =
	'You are an OCR assistant. Extract text regions from the image. Do not count characters or evaluate rules. Return strict JSON only. Do not wrap the JSON in code fences.';

/**
 * Build the user prompt for general mode.
 *
 * Direct, format-only — the model just needs to return every distinct
 * text region it can see as a flat list.
 */
export function buildGeneralUserPrompt(): string {
	return 'Return JSON: { "regions": ["text1", "text2", ...] } listing each distinct text region you can see, in no particular order.';
}

/**
 * Build the user prompt for template mode.
 *
 * Field labels are encoded as `JSON.stringify(labels)` so the model
 * sees an unambiguous JSON array literal of strings. This prevents a
 * label from breaking out into surrounding prose and giving the model
 * trailing free-form instructions (G2).
 */
export function buildTemplateUserPrompt(labels: string[]): string {
	const fieldsJson = JSON.stringify(labels);
	return [
		`Fields: ${fieldsJson}`,
		'Return JSON: { "matches": [{"label": "<one of the fields>", "text": "<extracted text>"}, ...], "unassigned": ["<extra text not matching any field>", ...] }',
		"Each field appears at most once in matches. If no region matches a field, include it with empty text. Place any region you couldn't confidently match in unassigned.",
	].join('\n');
}

/**
 * Combine system + user prompt into the single string the
 * `AIVisionRequest.prompt` field accepts.
 */
function compose(system: string, user: string): string {
	return `${system}\n\n${user}`;
}

/**
 * Pure entry point used by the extraction service.
 *
 * For `mode === 'template'` a `template` argument is required —
 * callers should construct the labels list from
 * `template.fields.map(f => f.label)` after sorting by position.
 * Validation that the template exists / belongs to the caller's org is
 * the service's responsibility, not the builder's.
 */
export function buildPrompt(
	mode: ExtractMode,
	template?: TemplateResponseDto,
): string {
	if (mode === 'template') {
		if (!template) {
			throw new Error(
				'buildPrompt: template mode requires a template argument',
			);
		}
		const labels = [...template.fields]
			.sort((a, b) => a.position - b.position)
			.map((f) => f.label);
		return compose(SYSTEM_PROMPT, buildTemplateUserPrompt(labels));
	}
	return compose(SYSTEM_PROMPT, buildGeneralUserPrompt());
}
