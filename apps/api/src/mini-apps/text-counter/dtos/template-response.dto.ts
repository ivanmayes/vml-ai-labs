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
	createdById: string;
	name: string;
	fields: TemplateFieldResponseDto[];
	createdAt: Date;
	updatedAt: Date;
}
