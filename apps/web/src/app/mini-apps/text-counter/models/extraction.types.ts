/**
 * Mirror of the API's text-counter extraction request/response shapes.
 *
 * Kept inline because web mini-apps cannot cross-import other mini-apps
 * (`no-restricted-imports` rule in eslint.config.mjs). Any change to
 * the API DTOs requires a touch here too.
 *
 * Source of truth on the API side:
 *   apps/api/src/mini-apps/text-counter/dtos/extract-request.dto.ts
 *   apps/api/src/mini-apps/text-counter/dtos/extract-response.dto.ts
 */

/**
 * Extraction mode discriminator.
 *
 * - `general` — flat list of distinct text regions found on the image.
 * - `template` — regions matched against a saved template's labeled
 *   fields, plus any regions the model couldn't confidently match.
 */
export type ExtractMode = 'general' | 'template';

/**
 * Response payload for `mode === 'general'`. Order is not significant.
 */
export interface GeneralExtractionResult {
	regions: string[];
}

/**
 * One matched field on a template-mode response. `text` may be empty
 * when the model couldn't find a region for the field — that's the
 * server's contract, not a client-side default.
 */
export interface TemplateExtractionMatch {
	label: string;
	text: string;
}

/**
 * Response payload for `mode === 'template'`. Contains one `match` per
 * template field (in the template's field order) plus any regions that
 * didn't map cleanly to a field.
 */
export interface TemplateExtractionResult {
	matches: TemplateExtractionMatch[];
	unassigned: string[];
}

/**
 * Discriminated union over the two response shapes. Use
 * `isTemplateExtractionResult()` to narrow.
 */
export type ExtractionResult =
	| GeneralExtractionResult
	| TemplateExtractionResult;

/**
 * Type guard. Returns true when `r` is the template-mode shape. The
 * presence of `matches` is the discriminator — general-mode payloads
 * never include it.
 */
export function isTemplateExtractionResult(
	r: ExtractionResult,
): r is TemplateExtractionResult {
	return Array.isArray((r as TemplateExtractionResult).matches);
}
