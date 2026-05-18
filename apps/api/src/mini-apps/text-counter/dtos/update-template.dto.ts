import { CreateTemplateDto } from './create-template.dto';

/**
 * Full-replacement update body. We chose "PUT replaces the whole
 * template (name + ordered field list)" over a per-field diff because
 * V1 has no need for partial updates and the delete-and-reinsert
 * transaction is simpler than diffing field rows.
 */
export class UpdateTemplateDto extends CreateTemplateDto {}
