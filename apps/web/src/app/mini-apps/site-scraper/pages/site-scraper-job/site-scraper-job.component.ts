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
		this.scraperService
			.getPages(this.jobId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					this.pages.set(res.data || []);
					this.loadingPages.set(false);
					this.loadThumbnails();
				},
				error: () => {
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
		this.scraperService
			.getPages(this.jobId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					const newPages = res.data || [];
					const currentIds = new Set(this.pages().map((p) => p.id));
					this.pages.set(newPages);

					// Load thumbnails for any new pages
					const brandNew = newPages.filter(
						(p) =>
							!currentIds.has(p.id) && p.status === 'completed',
					);
					if (brandNew.length > 0) {
						this.loadThumbnailsForPages(brandNew);
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
		this.loadThumbnailsForPages(completed);
	}

	private loadThumbnailsForPages(pagesToLoad: ScrapedPage[]): void {
		// Collect s3Keys for the selected viewport from the completed pages
		const s3Keys: string[] = [];
		const keyToPageId: Record<string, string> = {};

		for (const page of pagesToLoad) {
			const screenshot = page.screenshots.find(
				(s) => s.viewport === this.selectedViewport,
			);
			if (screenshot?.s3Key) {
				s3Keys.push(screenshot.s3Key);
				keyToPageId[screenshot.s3Key] = page.id;
			}
		}

		if (s3Keys.length === 0) return;

		this.scraperService
			.getBatchPresignedUrls(this.jobId, s3Keys)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					const urls = res.data?.urls || {};
					const current = { ...this.thumbnailUrls() };

					for (const [key, url] of Object.entries(urls)) {
						const pageId = keyToPageId[key];
						if (pageId) {
							current[pageId] = url;
						}
					}

					this.thumbnailUrls.set(current);
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

		// Try to use already-loaded thumbnail URL first
		const existingUrl = this.thumbnailUrls()[page.id];
		if (existingUrl) {
			this.viewerImageUrl.set(existingUrl);
			return;
		}

		// Otherwise fetch a fresh presigned URL
		this.scraperService
			.getScreenshotUrl(this.jobId, page.id, this.selectedViewport)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					this.viewerImageUrl.set(res.data.url);
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
			.getHtmlUrl(this.jobId, page.id)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					window.open(res.data.url, '_blank');
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
