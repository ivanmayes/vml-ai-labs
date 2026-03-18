import {
	Component,
	signal,
	inject,
	OnInit,
	OnDestroy,
	DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ProgressBarModule } from 'primeng/progressbar';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { MessageService } from 'primeng/api';

import {
	SiteScraperService,
	ScrapeJob,
	AdminScrapeJob,
} from '../../services/site-scraper.service';
import { SiteScraperSseService } from '../../services/site-scraper-sse.service';
import { SessionQuery } from '../../../../state/session/session.query';

@Component({
	selector: 'app-site-scraper-home',
	standalone: true,
	imports: [
		CommonModule,
		FormsModule,
		TableModule,
		TagModule,
		ButtonModule,
		ToastModule,
		ProgressSpinnerModule,
		ProgressBarModule,
		InputTextModule,
		CardModule,
		SelectModule,
		SelectButtonModule,
	],
	providers: [MessageService, SiteScraperSseService],
	templateUrl: './site-scraper-home.component.html',
	styleUrl: './site-scraper-home.component.scss',
})
export class SiteScraperHomeComponent implements OnInit, OnDestroy {
	private readonly scraperService = inject(SiteScraperService);
	private readonly messageService = inject(MessageService);
	private readonly destroyRef = inject(DestroyRef);
	private readonly router = inject(Router);
	readonly sseService = inject(SiteScraperSseService);
	readonly sessionQuery = inject(SessionQuery);

	private refreshInterval: ReturnType<typeof setInterval> | null = null;

	// State
	jobs = signal<ScrapeJob[]>([]);
	adminJobs = signal<AdminScrapeJob[]>([]);
	loading = signal(false);
	isSubmitting = signal(false);

	// Form state
	formUrl = '';
	formDepth = 3;
	formViewports: number[] = [1920];

	// Options
	readonly depthOptions = [
		{ label: '1 level', value: 1 },
		{ label: '2 levels', value: 2 },
		{ label: '3 levels', value: 3 },
		{ label: '4 levels', value: 4 },
		{ label: '5 levels', value: 5 },
	];

	readonly viewportOptions = [
		{ label: '375', value: 375 },
		{ label: '768', value: 768 },
		{ label: '1024', value: 1024 },
		{ label: '1920', value: 1920 },
	];

	ngOnInit(): void {
		this.loadJobs();
		this.sseService.connect();
		this.subscribeSseEvents();

		if (this.sessionQuery.isAdmin()) {
			this.loadAdminJobs();
		}

		// Fallback polling every 15 seconds
		this.refreshInterval = setInterval(() => {
			this.refreshJobs();
			if (this.sessionQuery.isAdmin()) {
				this.refreshAdminJobs();
			}
		}, 15000);
	}

	ngOnDestroy(): void {
		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
		}
		this.sseService.disconnect();
	}

	loadJobs(): void {
		this.loading.set(true);
		this.scraperService
			.getJobs()
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					this.jobs.set(
						this.mergeQueuePositions(
							res.data?.results || [],
							res.data?.queuePositions,
						),
					);
					this.loading.set(false);
				},
				error: () => {
					this.loading.set(false);
				},
			});
	}

	/** Silent refresh without loading spinner to prevent table flicker. */
	private refreshJobs(): void {
		this.scraperService
			.getJobs()
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					this.jobs.set(
						this.mergeQueuePositions(
							res.data?.results || [],
							res.data?.queuePositions,
						),
					);
				},
			});
	}

	private mergeQueuePositions(
		jobs: ScrapeJob[],
		positions?: Record<string, number>,
	): ScrapeJob[] {
		if (!positions) return jobs;
		return jobs.map((job) => ({
			...job,
			queuePosition: positions[job.id] ?? null,
		}));
	}

	submitJob(): void {
		if (!this.formUrl || this.isSubmitting()) return;

		const viewports =
			this.formViewports.length > 0 ? this.formViewports : [1920];

		this.isSubmitting.set(true);
		this.scraperService
			.createJob({
				url: this.formUrl,
				maxDepth: this.formDepth,
				viewports,
			})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'success',
						summary: 'Job Created',
						detail: `Scrape job queued for ${this.formUrl}`,
					});
					this.formUrl = '';
					this.isSubmitting.set(false);
					this.refreshJobs();
				},
				error: (err: { error?: { data?: string } }) => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail:
							err.error?.data || 'Failed to create scrape job',
					});
					this.isSubmitting.set(false);
				},
			});
	}

	cancelJob(job: ScrapeJob): void {
		this.scraperService
			.deleteJob(job.id)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'info',
						summary: 'Cancelled',
						detail: 'Job cancelled',
					});
					this.refreshJobs();
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Could not cancel job',
					});
				},
			});
	}

	deleteJob(job: ScrapeJob): void {
		this.scraperService
			.deleteJob(job.id)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'info',
						summary: 'Deleted',
						detail: 'Job deleted',
					});
					this.refreshJobs();
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Could not delete job',
					});
				},
			});
	}

	retryJob(job: ScrapeJob): void {
		this.scraperService
			.retryJob(job.id)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'success',
						summary: 'Retrying',
						detail: `Job re-queued for ${job.url}`,
					});
					this.refreshJobs();
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Could not retry job',
					});
				},
			});
	}

	viewJob(job: ScrapeJob): void {
		this.router.navigate(['/apps/site-scraper', job.id]);
	}

	onRowSelect(event: { data?: ScrapeJob | ScrapeJob[] }): void {
		if (event.data && !Array.isArray(event.data)) {
			this.router.navigate(['/apps/site-scraper', event.data.id]);
		}
	}

	getStatusSeverity(
		status: string,
	): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
		const map: Record<
			string,
			'success' | 'info' | 'warn' | 'danger' | 'secondary'
		> = {
			completed: 'success',
			completed_with_errors: 'warn',
			running: 'info',
			pending: 'secondary',
			failed: 'danger',
			cancelled: 'secondary',
		};
		return map[status] || 'info';
	}

	formatStatus(status: string): string {
		return status.replace(/_/g, ' ');
	}

	getProgress(job: ScrapeJob): number {
		if (job.pagesDiscovered === 0) return 0;
		return Math.round((job.pagesCompleted / job.pagesDiscovered) * 100);
	}

	// --- Admin ---

	loadAdminJobs(): void {
		this.scraperService
			.getAdminJobs()
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					this.adminJobs.set(
						this.mergeQueuePositions(
							res.data?.results || [],
							res.data?.queuePositions,
						) as AdminScrapeJob[],
					);
				},
				error: (err) => {
					console.error('Failed to load admin jobs:', err);
				},
			});
	}

	private refreshAdminJobs(): void {
		this.scraperService
			.getAdminJobs()
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					this.adminJobs.set(
						this.mergeQueuePositions(
							res.data?.results || [],
							res.data?.queuePositions,
						) as AdminScrapeJob[],
					);
				},
			});
	}

	adminCancelJob(job: AdminScrapeJob): void {
		this.scraperService
			.adminCancelJob(job.id)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'info',
						summary: 'Cancelled',
						detail: `Admin cancelled job for ${job.url}`,
					});
					this.refreshAdminJobs();
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Could not cancel job',
					});
				},
			});
	}

	isStuck(job: AdminScrapeJob): boolean {
		const now = Date.now();
		if (job.status === 'running' && job.startedAt) {
			return now - new Date(job.startedAt).getTime() > 10 * 60 * 1000;
		}
		if (job.status === 'pending') {
			return now - new Date(job.createdAt).getTime() > 5 * 60 * 1000;
		}
		return false;
	}

	getJobDuration(job: AdminScrapeJob): string {
		const start = job.startedAt
			? new Date(job.startedAt)
			: new Date(job.createdAt);
		const end = job.completedAt ? new Date(job.completedAt) : new Date();
		const diffMs = end.getTime() - start.getTime();
		const mins = Math.floor(diffMs / 60000);
		if (mins < 1) return '<1m';
		if (mins < 60) return `${mins}m`;
		return `${Math.floor(mins / 60)}h ${mins % 60}m`;
	}

	private subscribeSseEvents(): void {
		this.sseService.jobStarted$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe(() => {
				this.refreshJobs();
				if (this.sessionQuery.isAdmin()) {
					this.refreshAdminJobs();
				}
			});

		this.sseService.pageCompleted$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((event) => {
				this.updateJobInList(event.id, {
					pagesCompleted: event.pagesCompleted,
					pagesDiscovered: event.pagesDiscovered,
				});
			});

		this.sseService.pagesDiscovered$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((event) => {
				this.updateJobInList(event.id, {
					pagesDiscovered: event.totalDiscovered,
				});
			});

		this.sseService.jobCompleted$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((event) => {
				this.updateJobInList(event.id, {
					status: event.status,
					pagesCompleted: event.pagesCompleted,
					pagesFailed: event.pagesFailed,
					pagesDiscovered: event.pagesDiscovered,
				});
				this.messageService.add({
					severity: 'success',
					summary: 'Scrape Complete',
					detail: `Finished with ${event.pagesCompleted} pages`,
				});
			});

		this.sseService.jobFailed$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((event) => {
				this.updateJobInList(event.id, { status: 'failed' });
				this.messageService.add({
					severity: 'error',
					summary: 'Scrape Failed',
					detail: event.error?.message || 'Job failed',
				});
			});

		this.sseService.jobCancelled$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((event) => {
				this.updateJobInList(event.id, { status: 'cancelled' });
			});
	}

	private updateJobInList(jobId: string, updates: Partial<ScrapeJob>): void {
		const current = this.jobs();
		const idx = current.findIndex((j) => j.id === jobId);
		if (idx >= 0) {
			const updated = [...current];
			updated[idx] = { ...updated[idx], ...updates };
			this.jobs.set(updated);
		} else {
			// Job not in list, refresh
			this.refreshJobs();
		}
	}
}
