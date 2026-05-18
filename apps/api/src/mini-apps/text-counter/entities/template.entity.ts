import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	OneToMany,
	JoinColumn,
	Index,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';

import { User } from '../../../user/user.entity';
import { Organization } from '../../../organization/organization.entity';

import { TemplateField } from './template-field.entity';

/**
 * Template entity — org-scoped reusable label + rule sets for the
 * text-counter image extraction "template" mode.
 *
 * Org isolation is enforced at the service layer (every query filters
 * by `organizationId`); the FK + `idx_tc_template_org` index back the
 * per-org list query path.
 *
 * Fields are eagerly loaded and ordered by `position` ASC so the
 * service does not need a hand-rolled join — the response shape always
 * carries the ordered field array.
 */
@Entity({ name: 'template', schema: 'text_counter' })
@Index('idx_tc_template_org', ['organizationId'])
export class Template {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('uuid')
	organizationId: string;

	@ManyToOne(() => Organization, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'organizationId',
		foreignKeyConstraintName: 'fk_tc_template_organization',
	})
	organization: Organization;

	@Column('uuid')
	createdById: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'createdById',
		foreignKeyConstraintName: 'fk_tc_template_created_by',
	})
	createdBy: User;

	@Column({ type: 'varchar', length: 255 })
	name: string;

	@OneToMany(() => TemplateField, (field) => field.template, {
		eager: true,
		cascade: false,
	})
	fields: TemplateField[];

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date;
}
