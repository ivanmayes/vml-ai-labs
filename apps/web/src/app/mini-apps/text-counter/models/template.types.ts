/**
 * Mirror of the API's text-counter template DTO shapes.
 *
 * Kept inline here because web mini-apps cannot cross-import other
 * mini-apps (`no-restricted-imports` rule in eslint.config.mjs blocks
 * `@api/mini-apps/*`). Any DTO field change on the API side requires a
 * touch in this file too.
 *
 * Source of truth on the API side:
 *   apps/api/src/mini-apps/text-counter/dtos/template-response.dto.ts
 *   apps/api/src/mini-apps/text-counter/dtos/create-template.dto.ts
 *   apps/api/src/mini-apps/text-counter/dtos/update-template.dto.ts
 *   apps/api/src/mini-apps/text-counter/dtos/template-field.dto.ts
 *
 * The validation `Rule` discriminated union lives in `./rule.types` (the
 * shape was settled in U7 ahead of the templates wire-up). Re-export it
 * here so consumers can pull `Rule` from the same module as `Template`
 * if convenient, but the canonical home for `Rule` is `rule.types.ts`.
 */
import type { Rule } from './rule.types';

export type { Rule };

/**
 * A field row on a saved template.
 *
 * `position` is the 0-based display order — the API persists fields in
 * this order and the response array is already sorted by it.
 */
export interface TemplateField {
	id: string;
	label: string;
	position: number;
	rules: Rule[];
}

/**
 * A saved template owned by an organization. Returned by GET /templates
 * (as an array) and GET /templates/:id, POST /templates, PUT /templates/:id.
 *
 * Server-assigned fields (`id`, `organizationId`, `createdById`, timestamps)
 * are present on responses; payload types (`CreateTemplatePayload`,
 * `UpdateTemplatePayload`) drop these.
 *
 * `createdAt` / `updatedAt` are ISO 8601 strings — the API returns
 * `Date` typed instances which serialize to ISO 8601 over the wire.
 */
export interface Template {
	id: string;
	organizationId: string;
	/**
	 * Author id. Becomes `null` if the original author is later
	 * deleted — templates survive their author so other org members
	 * can keep using them.
	 */
	createdById: string | null;
	name: string;
	createdAt: string;
	updatedAt: string;
	fields: TemplateField[];
}

/**
 * Field shape on a create / update payload. `position` is derived from
 * array order on the API side (the service re-numbers positions on
 * save), but the type carries it for round-trip clarity in case a
 * caller wants to set explicit ordering.
 *
 * `id` is optional and only relevant on update: send the existing
 * field id to preserve the row (and therefore preserve any client
 * state keyed by it — image-card assignments rely on this); omit `id`
 * to insert a new field; existing fields whose id is omitted from the
 * payload are deleted.
 */
export interface TemplateFieldPayload {
	id?: string;
	label: string;
	position?: number;
	rules: Rule[];
}

/**
 * Body for `POST /templates`. The API rejects an empty `fields` array.
 */
export interface CreateTemplatePayload {
	name: string;
	fields: TemplateFieldPayload[];
}

/**
 * Body for `PUT /templates/:id`. Full replacement — the API replaces
 * the field list wholesale rather than diffing.
 */
export interface UpdateTemplatePayload {
	name: string;
	fields: TemplateFieldPayload[];
}
