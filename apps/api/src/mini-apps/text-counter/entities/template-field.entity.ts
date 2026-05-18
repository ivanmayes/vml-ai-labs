import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';

import { Template } from './template.entity';

/**
 * Stored validation rule shape — JSONB array on each field row.
 *
 * V1 supports six rule types. The discriminator is `type`; the optional
 * payloads (`value`, `values`) vary per type. Class-validator on the
 * incoming DTOs enforces the shape; this interface mirrors the
 * post-validation runtime form.
 *
 * See plan Key Decisions: "Validation rules persist as JSONB ..." for
 * the rationale (cheaper for V1, single-query reads, no per-rule
 * schema migrations).
 */
export type StoredRule =
	| { type: 'maxCharacters'; value: number }
	| { type: 'maxWords'; value: number }
	| { type: 'minCharacters'; value: number }
	| { type: 'minWords'; value: number }
	| { type: 'singleLine' }
	| { type: 'forbiddenWords'; values: string[] };

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
	rules: StoredRule[];

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date;
}
