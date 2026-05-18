import type { RuleDtoUnion } from './rule.dto';

export interface TemplateFieldResponseDto {
	id: string;
	label: string;
	position: number;
	rules: RuleDtoUnion[];
}

export interface TemplateResponseDto {
	id: string;
	organizationId: string;
	/**
	 * Author id. Becomes `null` if the user is later deleted —
	 * templates survive their author so other org members can keep
	 * using them.
	 */
	createdById: string | null;
	name: string;
	fields: TemplateFieldResponseDto[];
	createdAt: Date;
	updatedAt: Date;
}
