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
import { JobStatus, canTransition } from '../types/job-status.enum';
import { ScrapeError } from '../types/scrape-error.types';
import { InvalidStatusTransitionError } from '../../../_platform/errors/domain.errors';

/**
 * ScrapeJob entity representing a website scraping request.
 * Tracks the full lifecycle from submission to completion/failure.
 *
 * Features:
 * - State machine validation for status transitions
 * - Type-safe error handling with JSONB storage
 * - Multi-viewport screenshot support via JSONB viewports array
 *
 * Composite indexes for common query patterns:
 * - listJobs: (userId, organizationId, status, createdAt DESC)
 */
@Entity({ name: 'scrape_jobs', schema: 'site_scraper' })
@Index('idx_ss_jobs_user_org_status', [
	'userId',
	'organizationId',
	'status',
	'createdAt',
])
export class ScrapeJob {
	@PrimaryGeneratedColumn('uuid')
	@Index()
	id: string;

	@Column({ type: 'varchar', length: 2048 })
	url: string;

	@Column({ type: 'int', default: 3 })
	maxDepth: number;

	@Column({ type: 'jsonb', default: () => "'[1920]'" })
	viewports: number[];

	@Column({
		type: 'enum',
		enum: JobStatus,
		enumName: 'ss_job_status',
		default: JobStatus.PENDING,
	})
	@Index()
	status: JobStatus;

	@Column({ type: 'int', default: 0 })
	pagesDiscovered: number;

	@Column({ type: 'int', default: 0 })
	pagesCompleted: number;

	@Column({ type: 'int', default: 0 })
	pagesFailed: number;

	@Column({ type: 'int', default: 0 })
	pagesSkippedByDepth: number;

	@Column({ type: 'jsonb', name: 'error', nullable: true })
	error: ScrapeError | null;

	@Column('uuid')
	@Index()
	userId: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId', foreignKeyConstraintName: 'fk_ss_job_user' })
	user: User;

	@Column('uuid')
	@Index()
	organizationId: string;

	@ManyToOne(() => Organization, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'organizationId',
		foreignKeyConstraintName: 'fk_ss_job_organization',
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
		if (newStatus === JobStatus.RUNNING) {
			this.startedAt = now;
		} else if (
			newStatus === JobStatus.COMPLETED ||
			newStatus === JobStatus.COMPLETED_WITH_ERRORS ||
			newStatus === JobStatus.FAILED
		) {
			this.completedAt = now;
		}
	}
}
