import {
	Component,
	signal,
	computed,
	inject,
	OnInit,
	OnDestroy,
	DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ProgressBarModule } from 'primeng/progressbar';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { PopoverModule } from 'primeng/popover';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageService } from 'primeng/api';

import {
	SiteScraperService,
	ScrapeJob,
	ScrapedPage,
} from '../../services/site-scraper.service';
import { SiteScraperSseService } from '../../services/site-scraper-sse.service';

@Component({
	selector: 'app-site-scraper-job',
	standalone: true,
	imports: [
		CommonModule,
		FormsModule,
		TagModule,
		ButtonModule,
		ToastModule,
		ProgressSpinnerModule,
		ProgressBarModule,
		SelectButtonModule,
		SkeletonModule,
		DialogModule,
		TooltipModule,
		PopoverModule,
		CheckboxModule,
	],
	providers: [MessageService, SiteScraperSseService],
	templateUrl: './site-scraper-job.component.html',
	styleUrl: './site-scraper-job.component.scss',
})
export class SiteScraperJobComponent implements OnInit, OnDestroy {
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly scraperService = inject(SiteScraperService);
	private readonly messageService = inject(MessageService);
	private readonly destroyRef = inject(DestroyRef);
	readonly sseService = inject(SiteScraperSseService);

	private jobId = '';
	private refreshInterval: ReturnType<typeof setInterval> | null = null;

	// State
	job = signal<ScrapeJob | null>(null);
	pages = signal<ScrapedPage[]>([]);
	loadingPages = signal(false);
	thumbnailUrls = signal<Record<string, string>>({});
	selectedViewport = 1920;

	// Download state
	downloading = signal(false);
	downloadFormats = signal<Record<string, boolean>>({
		html: true,
		markdown: true,
		screenshots: true,
	});

	// Viewer state
	viewerVisible = false;
	viewerPage = signal<ScrapedPage | null>(null);
	viewerImageUrl = signal<string>('');

	// Computed
	completedPages = computed(() =>
		this.pages().filter((p) => p.status === 'completed'),
	);

	availableViewports = computed(() => {
		const j = this.job();
		if (!j?.viewports?.length) return [];
		return j.viewports.map((v) => ({ label: `${v}px`, value: v }));
	});

	pagesInQueue = computed(() => {
		const j = this.job();
		if (!j) return 0;
		return Math.max(
			0,
			j.pagesDiscovered - j.pagesCompleted - j.pagesFailed,
		);
	});

	isFullyCaptured = computed(() => {
		const j = this.job();
		if (!j) return false;
		return j.pagesFailed === 0 && this.pagesInQueue() === 0;
	});

	canDownload = computed(() => {
		const j = this.job();
		if (!j) return false;
		return (
			j.pagesCompleted > 0 &&
			j.status !== 'pending' &&
			j.status !== 'running'
		);
	});

	pendingSkeletons = computed(() => {
		const j = this.job();
		if (!j || j.status !== 'running') return [];
		const pending = j.pagesDiscovered - this.pages().length;
		return pending > 0
			? Array.from({ length: Math.min(pending, 10) }, (_, i) => i)
			: [];
	});

	ngOnInit(): void {
		this.jobId = this.route.snapshot.params['id'];
		if (!this.jobId) {
			this.router.navigate(['/apps/site-scraper']);
			return;
		}

		this.loadJob();
		this.loadPages();
		this.sseService.connect();
		this.subscribeSseEvents();

		// Fallback polling every 10 seconds for active jobs
		this.refreshInterval = setInterval(() => {
			const status = this.job()?.status;
			if (status === 'running' || status === 'pending') {
				this.refreshJob();
				this.refreshPages();
			}
		}, 10000);
	}

	ngOnDestroy(): void {
		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
		}
		this.sseService.disconnect();
	}

	retryJob(): void {
		this.scraperService
			.retryJob(this.jobId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					this.job.set(res.data);
					this.sseService.disconnect();
					this.sseService.connect();
					this.loadPages();
					this.messageService.add({
						severity: 'success',
						summary: 'Retrying',
						detail: 'Job re-queued for processing',
					});
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

	isRetryable(): boolean {
		const status = this.job()?.status;
		return (
			status === 'failed' ||
			status === 'completed_with_errors' ||
			status === 'cancelled'
		);
	}

	goBack(): void {
		this.router.navigate(['/apps/site-scraper']);
	}

	loadJob(): void {
		this.scraperService
			.getJob(this.jobId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					this.job.set(res.data);
					// Set initial viewport from job config
					if (
						res.data.viewports?.length &&
						!res.data.viewports.includes(this.selectedViewport)
					) {
						this.selectedViewport = res.data.viewports[0];
					}
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Could not load job details',
					});
					this.router.navigate(['/apps/site-scraper']);
				},
			});
	}

	loadPages(): void {
		this.loadingPages.set(true);
		this.fetchAllPages(1, []);
	}

	private fetchAllPages(page: number, accumulated: ScrapedPage[]): void {
		this.scraperService
			.getPages(this.jobId, page, 100)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					const all = [...accumulated, ...(res.data?.results || [])];
					if (page < res.data.numPages) {
						this.fetchAllPages(page + 1, all);
					} else {
						this.pages.set(all);
						this.loadingPages.set(false);
						this.loadThumbnails();
					}
				},
				error: () => {
					// Set whatever we've accumulated so far
					if (accumulated.length > 0) {
						this.pages.set(accumulated);
					}
					this.loadingPages.set(false);
				},
			});
	}

	private refreshJob(): void {
		this.scraperService
			.getJob(this.jobId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					this.job.set(res.data);
				},
			});
	}

	private refreshPages(): void {
		this.refreshAllPages(1, []);
	}

	private refreshAllPages(page: number, accumulated: ScrapedPage[]): void {
		this.scraperService
			.getPages(this.jobId, page, 100)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					const all = [...accumulated, ...(res.data?.results || [])];
					if (page < res.data.numPages) {
						this.refreshAllPages(page + 1, all);
					} else {
						const currentIds = new Set(
							this.pages().map((p) => p.id),
						);
						this.pages.set(all);

						// Load thumbnails for any new pages
						const hasNew = all.some(
							(p) =>
								!currentIds.has(p.id) &&
								p.status === 'completed',
						);
						if (hasNew) {
							this.loadThumbnailsForPages();
						}
					}
				},
			});
	}

	onViewportChange(): void {
		// Clear existing thumbnails and reload for new viewport
		this.thumbnailUrls.set({});
		this.loadThumbnails();
		// Clear viewer image if open
		this.viewerImageUrl.set('');
		if (this.viewerPage()) {
			this.loadViewerImage(this.viewerPage()!);
		}
	}

	private loadThumbnails(): void {
		const completed = this.completedPages();
		if (completed.length === 0) return;
		this.loadThumbnailsForPages();
	}

	private loadThumbnailsForPages(page = 1): void {
		this.scraperService
			.getBatchPresignedUrls(this.jobId, this.selectedViewport, page, 50)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					const current = { ...this.thumbnailUrls() };
					for (const item of res.data?.urls || []) {
						if (item.presignedUrl) {
							current[item.pageId] = item.presignedUrl;
						}
					}
					this.thumbnailUrls.set(current);

					// Fetch next page if more results
					if (page < res.data.numPages) {
						this.loadThumbnailsForPages(page + 1);
					}
				},
			});
	}

	openViewer(page: ScrapedPage): void {
		this.viewerPage.set(page);
		this.viewerVisible = true;
		this.loadViewerImage(page);
	}

	private loadViewerImage(page: ScrapedPage): void {
		this.viewerImageUrl.set('');

		// Always fetch full-res URL for the viewer (not thumbnails)
		this.scraperService
			.getScreenshotUrl(page.id, this.selectedViewport)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					this.viewerImageUrl.set(res.data.presignedUrl);
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Could not load screenshot',
					});
				},
			});
	}

	openPageUrl(url: string): void {
		window.open(url, '_blank', 'noopener,noreferrer');
	}

	downloadHtml(page: ScrapedPage): void {
		this.scraperService
			.getHtmlUrl(page.id)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					window.open(res.data.presignedUrl, '_blank');
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Could not load HTML',
					});
				},
			});
	}

	startDownload(): void {
		const formats = Object.entries(this.downloadFormats())
			.filter(([, enabled]) => enabled)
			.map(([format]) => format);

		if (formats.length === 0) return;

		this.downloading.set(true);
		this.scraperService
			.getDownloadToken(this.jobId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					const url = this.scraperService.getDownloadUrl(
						this.jobId,
						res.data.token,
						formats,
					);
					window.location.assign(url);
					// Reset downloading state after giving the browser time to start
					setTimeout(() => {
						this.downloading.set(false);
					}, 3000);
				},
				error: () => {
					this.downloading.set(false);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Could not initiate download',
					});
				},
			});
	}

	hasSelectedFormats(): boolean {
		return Object.values(this.downloadFormats()).some((v) => v);
	}

	toggleFormat(format: string): void {
		this.downloadFormats.update((current) => ({
			...current,
			[format]: !current[format],
		}));
	}

	onImageError(event: Event): void {
		const img = event.target as HTMLImageElement;
		img.style.display = 'none';
	}

	getProgress(): number {
		const j = this.job();
		if (!j || j.pagesDiscovered === 0) return 0;
		return Math.round((j.pagesCompleted / j.pagesDiscovered) * 100);
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

	private subscribeSseEvents(): void {
		this.sseService.jobStarted$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((event) => {
				if (event.id === this.jobId) {
					this.job.update((j) =>
						j ? { ...j, status: 'running' } : j,
					);
				}
			});

		this.sseService.pageCompleted$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((event) => {
				if (event.id === this.jobId) {
					this.job.update((j) =>
						j
							? {
									...j,
									pagesCompleted: event.pagesCompleted,
									pagesDiscovered: event.pagesDiscovered,
								}
							: j,
					);
					// Refresh pages to get the new page data
					this.refreshPages();
				}
			});

		this.sseService.pagesDiscovered$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((event) => {
				if (event.id === this.jobId) {
					this.job.update((j) =>
						j
							? { ...j, pagesDiscovered: event.totalDiscovered }
							: j,
					);
				}
			});

		this.sseService.jobCompleted$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((event) => {
				if (event.id === this.jobId) {
					this.job.update((j) =>
						j
							? {
									...j,
									status: event.status,
									pagesCompleted: event.pagesCompleted,
									pagesFailed: event.pagesFailed,
									pagesDiscovered: event.pagesDiscovered,
									pagesSkippedByDepth:
										event.pagesSkippedByDepth,
								}
							: j,
					);
					this.refreshPages();
					this.messageService.add({
						severity: 'success',
						summary: 'Scrape Complete',
						detail: `Finished with ${event.pagesCompleted} pages`,
					});
				}
			});

		this.sseService.jobFailed$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((event) => {
				if (event.id === this.jobId) {
					this.job.update((j) =>
						j ? { ...j, status: 'failed' } : j,
					);
					this.messageService.add({
						severity: 'error',
						summary: 'Scrape Failed',
						detail: event.error?.message || 'Job failed',
					});
				}
			});

		this.sseService.jobCancelled$
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((event) => {
				if (event.id === this.jobId) {
					this.job.update((j) =>
						j ? { ...j, status: 'cancelled' } : j,
					);
				}
			});
	}
}
