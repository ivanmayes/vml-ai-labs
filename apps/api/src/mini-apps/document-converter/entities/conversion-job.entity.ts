import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
	Index,
	CreateDateColumn,
	UpdateDateColumn,
	VersionColumn,
	Unique,
} from 'typeorm';

import { User } from '../../../user/user.entity';
import { Organization } from '../../../organization/organization.entity';
import { JobStatus, canTransition } from '../types/job-status.enum';
import { ConversionError } from '../types/conversion-error.types';
import { InvalidStatusTransitionError } from '../errors/domain.errors';

/**
 * ConversionJob entity representing a document conversion request.
 * Tracks the full lifecycle from upload to completion/failure.
 *
 * Features:
 * - Optimistic locking via @VersionColumn for concurrent access
 * - State machine validation for status transitions
 * - Type-safe error handling with JSONB storage
 * - Idempotency key to prevent duplicate uploads
 *
 * Composite indexes for common query patterns:
 * - listJobs: (userId, organizationId, status, createdAt DESC)
 * - pending queue: (status, createdAt) for queue position queries
 */
@Entity({ name: 'conversion_jobs', schema: 'document_converter' })
@Unique(['organizationId', 'idempotencyKey'])
@Index('idx_dc_jobs_user_org_status_created', [
	'userId',
	'organizationId',
	'status',
	'createdAt',
])
@Index('idx_dc_jobs_status_created', ['status', 'createdAt'])
export class ConversionJob {
	@PrimaryGeneratedColumn('uuid')
	@Index()
	id: string;

	@Column({ type: 'varchar', length: 255 })
	fileName: string;

	@Column({ type: 'varchar', length: 255 })
	originalFileName: string;

	@Column({ type: 'int' })
	fileSize: number;

	@Column({
		type: 'enum',
		enum: JobStatus,
		default: JobStatus.PENDING,
	})
	@Index()
	status: JobStatus;

	@Column({ type: 'varchar', length: 50, nullable: true })
	engine: string; // mammoth, pandoc, pdf-parse, xlsx, pptx-parser

	@Column({ type: 'jsonb', name: 'error', nullable: true })
	error: ConversionError | null;

	@Column({ type: 'varchar', length: 100 })
	mimeType: string;

	@Column({ type: 'varchar', length: 20 })
	fileExtension: string;

	@Column({ type: 'varchar', length: 500, nullable: true })
	s3InputKey: string;

	@Column({ type: 'varchar', length: 500, nullable: true })
	s3OutputKey: string;

	@Column({ type: 'int', nullable: true })
	outputSize: number;

	@Column({ type: 'int', nullable: true })
	processingTimeMs: number;

	@Column({ type: 'varchar', length: 100, nullable: true })
	pgBossJobId: string;

	@Column({ type: 'varchar', length: 100, nullable: true })
	@Index()
	idempotencyKey: string;

	@Column('uuid')
	@Index()
	userId: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId', foreignKeyConstraintName: 'fk_dc_job_user' })
	user: User;

	@Column('uuid')
	@Index()
	organizationId: string;

	@ManyToOne(() => Organization, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'organizationId',
		foreignKeyConstraintName: 'fk_dc_job_organization',
	})
	organization: Organization;

	@CreateDateColumn({ type: 'timestamptz' })
	@Index()
	createdAt: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date;

	@Column({ type: 'timestamptz', nullable: true })
	startedAt: Date;

	@Column({ type: 'timestamptz', nullable: true })
	completedAt: Date;

	@Column({ type: 'timestamptz', nullable: true })
	@Index()
	expiresAt: Date; // When download link expires (24 hours after completion)

	@Column({ type: 'int', default: 0 })
	retryCount: number;

	@Column({ type: 'int', default: 3 })
	maxRetries: number;

	@VersionColumn()
	version: number; // Optimistic locking for concurrent access

	/**
	 * State transition helper with validation.
	 * Validates the transition is allowed before updating status.
	 * @throws InvalidStatusTransitionError if transition is not allowed
	 */
	transitionTo(newStatus: JobStatus): void {
		if (!canTransition(this.status, newStatus)) {
			throw new InvalidStatusTransitionError(
				`Cannot transition from ${this.status} to ${newStatus}`,
			);
		}
		this.status = newStatus;

		// Update timestamps based on state
		const now = new Date();
		if (newStatus === JobStatus.PROCESSING) {
			this.startedAt = now;
		} else if (
			newStatus === JobStatus.COMPLETED ||
			newStatus === JobStatus.FAILED
		) {
			this.completedAt = now;
			if (newStatus === JobStatus.COMPLETED) {
				// Set expiry to 24 hours from completion
				this.expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
			}
		}
	}

	/**
	 * Check if the job can be retried.
	 */
	canRetry(): boolean {
		return (
			this.status === JobStatus.FAILED &&
			this.retryCount < this.maxRetries
		);
	}

	/**
	 * Check if download is available for this job.
	 */
	isDownloadAvailable(): boolean {
		return (
			this.status === JobStatus.COMPLETED &&
			this.s3OutputKey !== null &&
			(this.expiresAt === null || new Date() < this.expiresAt)
		);
	}
}
