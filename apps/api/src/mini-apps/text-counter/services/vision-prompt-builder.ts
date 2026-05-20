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
 *
 * The region-separation rules are the load-bearing piece: lite/flash
 * vision models tend to merge a headline and its subline into one
 * block, or treat a product mark as the headline. Spelling out what
 * counts as "one region" vs "two regions" up front cuts those errors.
 */
export const SYSTEM_PROMPT = [
	'You are a vision assistant that extracts and structures visible text from images.',
	'Identify EVERY distinct text region you can see, then return strict JSON only. Do not wrap the JSON in code fences.',
	'',
	'How to decide if two text blocks are ONE region or TWO separate regions:',
	'- ONE region: lines that share typography (same font family, weight, and size) AND are visually grouped (no large gap, same color, same alignment). A multi-line paragraph stays as one region.',
	'- TWO regions: any time the typography or visual treatment changes — different font size, different weight, different color, different position, or a visible gap between the blocks. A large headline above a smaller supporting line is ALWAYS two regions, never one.',
	'- A product mark, logo lockup, model number, or badge is its own region — never merge it with marketing copy.',
	'- Fine print, legal, or disclaimers at the bottom edge are their own region — never merge with the main copy above.',
	'',
	'Return the visible text verbatim: preserve case, punctuation, apostrophes, and line breaks within a single region. Do not invent or paraphrase text.',
].join('\n');

/**
 * Build the user prompt for general mode.
 *
 * Direct, format-only — the model just needs to return every distinct
 * text region it can see as a flat list.
 */
export function buildGeneralUserPrompt(): string {
	return 'Return JSON: { "regions": ["text1", "text2", ...] } listing each distinct text region you can see, in no particular order. Follow the separation rules in the system prompt — do not merge two visually-distinct blocks into one region.';
}

/**
 * Build the user prompt for template mode.
 *
 * Field labels are encoded as `JSON.stringify(labels)` so the model
 * sees an unambiguous JSON array literal of strings. This prevents a
 * label from breaking out into surrounding prose and giving the model
 * trailing free-form instructions (G2).
 *
 * The body of the prompt is intentionally label-agnostic — every
 * concrete label appears exactly once inside the `Fields:` JSON array,
 * never re-mentioned in prose. That keeps adversarial labels from
 * gaining a second voice in the prompt and keeps the spec invariant
 * (`expect(occurrences).toBe(1)`) green.
 */
export function buildTemplateUserPrompt(labels: string[]): string {
	const fieldsJson = JSON.stringify(labels);
	return [
		`Fields: ${fieldsJson}`,
		'Each field name describes the semantic ROLE that piece of text plays in the image — its purpose, hierarchy, or visual prominence. First identify all distinct text regions per the system-prompt rules, then assign each region to the field whose role best fits it.',
		'Heuristics for role matching:',
		'- The single most visually-prominent line of marketing copy (largest weight + size) is usually the primary headline.',
		'- A smaller, supporting line immediately above or below the prominent line is usually a secondary / supporting / subhead role.',
		'- A short directive phrase that looks like a button (e.g. "Shop now", "Learn more") is usually a call-to-action.',
		'- Bottom-of-frame fine print is usually a disclaimer or legal line.',
		'- A product name, logo lockup, model number, or badge is rarely a headline — leave it in unassigned unless a field explicitly describes a product mark.',
		'Return JSON: { "matches": [{"label": "<one of the fields>", "text": "<verbatim text>"}, ...], "unassigned": ["<extra text not matching any field>", ...] }',
		'Hard rules:',
		'- Each field appears at most once in matches.',
		'- NEVER combine two visually-distinct regions into a single field. If you would have to merge two regions to fill a field, leave that field empty and place each region individually in unassigned.',
		'- If no region matches a field, include the field with empty text.',
		"- Place any region you couldn't confidently match in unassigned. Leaving a field empty is better than assigning mismatched text.",
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
