/**
 * Response shapes for `POST /apps/text-counter/extract`.
 *
 * General mode returns a flat list of extracted text regions; template
 * mode returns one match entry per template field (text may be empty if
 * the model couldn't find a region for that field) plus a separate list
 * of regions that didn't map to any field.
 *
 * These are response-only types (no class-validator decorators) — the
 * server constructs them; clients consume them. The controller wraps
 * them in `ResponseEnvelope` before they leave the API.
 */

export interface ExtractMatchDto {
	label: string;
	text: string;
}

export interface ExtractGeneralResponseDto {
	regions: string[];
}

export interface ExtractTemplateResponseDto {
	matches: ExtractMatchDto[];
	unassigned: string[];
}

export type ExtractResponseDto =
	| ExtractGeneralResponseDto
	| ExtractTemplateResponseDto;
