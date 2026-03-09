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

import { UpdaterTask } from './updater-task.entity';

export enum TaskRunStatus {
	PENDING = 'pending',
	PROCESSING = 'processing',
	COMPLETED = 'completed',
	FAILED = 'failed',
	CANCELLED = 'cancelled',
}

@Entity({ name: 'task_runs', schema: 'wpp_open_agent_updater' })
@Index('idx_woau_runs_task_status', ['taskId', 'status'])
@Index('idx_woau_runs_org_created', ['organizationId', 'createdAt'])
export class TaskRun {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('uuid')
	@Index()
	taskId: string;

	@ManyToOne(() => UpdaterTask, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'taskId',
		foreignKeyConstraintName: 'fk_woau_runs_task',
	})
	task: UpdaterTask;

	@Column({
		type: 'enum',
		enum: TaskRunStatus,
		default: TaskRunStatus.PENDING,
	})
	status: TaskRunStatus;

	@Column({ type: 'timestamptz', nullable: true })
	startedAt: Date | null;

	@Column({ type: 'timestamptz', nullable: true })
	completedAt: Date | null;

	@Column({ type: 'int', default: 0 })
	filesFound: number;

	@Column({ type: 'int', default: 0 })
	filesProcessed: number;

	@Column({ type: 'int', default: 0 })
	filesFailed: number;

	@Column({ type: 'int', default: 0 })
	filesSkipped: number;

	@Column({ type: 'text', nullable: true })
	errorMessage: string | null;

	@Column('uuid')
	triggeredById: string;

	@Column('uuid')
	@Index()
	organizationId: string;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date;
}
