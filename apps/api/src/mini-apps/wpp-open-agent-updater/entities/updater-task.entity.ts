import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
	Index,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';

import { User } from '../../../user/user.entity';
import { Organization } from '../../../organization/organization.entity';

export enum UpdaterTaskStatus {
	ACTIVE = 'active',
	PAUSED = 'paused',
	ARCHIVED = 'archived',
}

@Entity({ name: 'updater_tasks', schema: 'wpp_open_agent_updater' })
@Index('idx_woau_tasks_org_status', ['organizationId', 'status'])
export class UpdaterTask {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ type: 'varchar', length: 255 })
	name: string;

	@Column({ type: 'varchar', length: 100 })
	boxFolderId: string;

	@Column({ type: 'varchar', length: 255, nullable: true })
	boxFolderName: string;

	@Column({ type: 'varchar', length: 100 })
	wppOpenAgentId: string;

	@Column({ type: 'varchar', length: 255, nullable: true })
	wppOpenAgentName: string;

	@Column({ type: 'varchar', length: 100 })
	wppOpenProjectId: string;

	@Column({
		type: 'enum',
		enum: UpdaterTaskStatus,
		default: UpdaterTaskStatus.ACTIVE,
	})
	status: UpdaterTaskStatus;

	@Column({
		type: 'jsonb',
		default: () => `'["docx","pdf","pptx","xlsx"]'`,
	})
	fileExtensions: string[];

	@Column({ type: 'boolean', default: true })
	includeSubfolders: boolean;

	@Column({ type: 'varchar', length: 50, default: 'manual' })
	cadence: string;

	@Column({ type: 'timestamptz', nullable: true })
	lastRunAt: Date | null;

	@Column('uuid')
	@Index()
	createdById: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'createdById',
		foreignKeyConstraintName: 'fk_woau_tasks_created_by',
	})
	createdBy: User;

	@Column('uuid')
	@Index()
	organizationId: string;

	@ManyToOne(() => Organization, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'organizationId',
		foreignKeyConstraintName: 'fk_woau_tasks_organization',
	})
	organization: Organization;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date;
}
