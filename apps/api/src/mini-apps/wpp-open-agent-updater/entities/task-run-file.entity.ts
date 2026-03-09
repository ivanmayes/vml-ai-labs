import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
	Index,
	CreateDateColumn,
} from 'typeorm';

import { TaskRun } from './task-run.entity';

export enum TaskRunFileStatus {
	PENDING = 'pending',
	DOWNLOADING = 'downloading',
	CONVERTING = 'converting',
	UPLOADING = 'uploading',
	COMPLETED = 'completed',
	FAILED = 'failed',
}

@Entity({ name: 'task_run_files', schema: 'wpp_open_agent_updater' })
@Index('idx_woau_files_run_status', ['taskRunId', 'status'])
export class TaskRunFile {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('uuid')
	@Index()
	taskRunId: string;

	@ManyToOne(() => TaskRun, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'taskRunId',
		foreignKeyConstraintName: 'fk_woau_files_run',
	})
	taskRun: TaskRun;

	@Column({ type: 'varchar', length: 255 })
	boxFileId: string;

	@Column({ type: 'varchar', length: 500 })
	fileName: string;

	@Column({ type: 'bigint', default: 0 })
	fileSize: number;

	@Column({
		type: 'enum',
		enum: TaskRunFileStatus,
		default: TaskRunFileStatus.PENDING,
	})
	status: TaskRunFileStatus;

	@Column({ type: 'text', nullable: true })
	errorMessage: string | null;

	@Column({ type: 'timestamptz', nullable: true })
	processedAt: Date | null;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date;
}
