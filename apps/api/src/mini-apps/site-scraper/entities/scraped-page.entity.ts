import {
	Entity,
	Column,
	PrimaryGeneratedColumn,
	ManyToOne,
	JoinColumn,
	Index,
	CreateDateColumn,
	UpdateDateColumn,
	Unique,
} from 'typeorm';

import { PageStatus } from '../types/job-status.enum';

import { ScrapeJob } from './scrape-job.entity';

/**
 * Screenshot record stored as JSONB in the scraped_pages table.
 */
export interface ScreenshotRecord {
	/** Viewport width in pixels */
	viewport: number;
	/** S3 object key for the screenshot image */
	s3Key: string;
}

/**
 * ScrapedPage entity representing a single page captured during a scrape job.
 * Each page can have multiple screenshots (one per viewport) and an HTML snapshot.
 *
 * Features:
 * - Unique constraint on (scrapeJobId, url) to prevent duplicate pages per job
 * - JSONB storage for viewport-specific screenshot records
 * - Page-level status tracking independent of job status
 */
@Entity({ name: 'scraped_pages', schema: 'site_scraper' })
@Unique(['scrapeJobId', 'url'])
@Index('idx_ss_pages_job_status', ['scrapeJobId', 'status'])
export class ScrapedPage {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('uuid')
	scrapeJobId: string;

	@ManyToOne(() => ScrapeJob, { onDelete: 'CASCADE' })
	@JoinColumn({
		name: 'scrapeJobId',
		foreignKeyConstraintName: 'fk_ss_page_job',
	})
	scrapeJob: ScrapeJob;

	@Column({ type: 'varchar', length: 2048 })
	url: string;

	@Column({ type: 'varchar', length: 255, nullable: true })
	title: string | null;

	@Column({ type: 'varchar', length: 500, nullable: true })
	htmlS3Key: string | null;

	@Column({ type: 'jsonb', default: () => "'[]'" })
	screenshots: ScreenshotRecord[];

	@Column({
		type: 'enum',
		enum: PageStatus,
		enumName: 'ss_page_status',
		default: PageStatus.PENDING,
	})
	status: PageStatus;

	@Column({ type: 'varchar', length: 500, nullable: true })
	errorMessage: string | null;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt: Date;
}
