import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';

import type { RuleDtoUnion } from '../dtos/rule.dto';

import { Template } from './template.entity';

/**
 * Stored validation rule shape — JSONB array on each field row.
 *
 * Mirrors the post-validation `RuleDtoUnion` runtime shape; we import
 * the DTO union directly instead of redeclaring it here so the entity
 * and DTOs cannot drift out of sync.
 *
 * See plan Key Decisions: "Validation rules persist as JSONB ..." for
 * the rationale (cheaper for V1, single-query reads, no per-rule
 * schema migrations).
 */

@Entity({ name: 'template_field', schema: 'text_counter' })
export class TemplateField {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('uuid')
	templateId: string;

	@ManyToOne(() => Template, (template) => template.fields, {
		onDelete: 'CASCADE',
	})
	@JoinColumn({
		name: 'templateId',
		foreignKeyConstraintName: 'fk_tc_template_field_template',
	})
	template: Template;

	@Column({ type: 'varchar', length: 255 })
	label: string;

	@Column({ type: 'int' })
	position: number;

	@Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
	rules: RuleDtoUnion[];

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date;
}
