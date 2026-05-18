import { IsIn, IsUUID, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Extraction mode discriminator.
 *
 * - `general` returns a flat list of text regions.
 * - `template` requires a `templateId` and returns matches against the
 *   template's labeled fields plus any unassigned regions.
 */
export type ExtractMode = 'general' | 'template';

/**
 * Multipart body for `POST /apps/text-counter/extract`.
 *
 * The image file itself is uploaded via the `file` multipart part and is
 * handled by the controller's `FileInterceptor` — only the mode +
 * optional template id flow through class-validator here.
 */
export class ExtractRequestDto {
	@ApiProperty({
		enum: ['general', 'template'],
		description:
			"`general` extracts all distinct text regions; `template` matches regions to a saved template's fields.",
	})
	@IsIn(['general', 'template'])
	mode: ExtractMode;

	@ApiProperty({
		required: false,
		format: 'uuid',
		description:
			'Required when `mode === "template"` — id of the saved template to match against. Must belong to the caller\'s org.',
	})
	@ValidateIf(
		(o: ExtractRequestDto) =>
			o.mode === 'template' || o.templateId !== undefined,
	)
	@IsUUID()
	templateId?: string;
}
