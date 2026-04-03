import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of, throwError, Subject } from 'rxjs';

import { SiteScraperJobComponent } from './site-scraper-job.component';
import {
	SiteScraperService,
	ScrapeJob,
	ScrapedPage,
} from '../../services/site-scraper.service';
import {
	SiteScraperSseService,
	PageCompletedEvent,
	PagesDiscoveredEvent,
} from '../../services/site-scraper-sse.service';

function makeJob(overrides: Partial<ScrapeJob> = {}): ScrapeJob {
	return {
		id: 'job-1',
		url: 'https://example.com',
		maxDepth: 3,
		viewports: [1920],
		status: 'completed',
		pagesDiscovered: 5,
		pagesCompleted: 5,
		pagesFailed: 0,
		pagesSkippedByDepth: 0,
		createdAt: '2026-01-01T00:00:00Z',
		...overrides,
	};
}

function makePage(overrides: Partial<ScrapedPage> = {}): ScrapedPage {
	return {
		id: 'page-1',
		scrapeJobId: 'job-1',
		url: 'https://example.com/page1',
		title: 'Page 1',
		htmlS3Key: 'some-key',
		screenshots: [],
		status: 'completed',
		errorMessage: null,
		createdAt: '2026-01-01T00:00:00Z',
		updatedAt: '2026-01-01T00:00:00Z',
		...overrides,
	};
}

function createSseSubjects() {
	return {
		pageCompleted$: new Subject<PageCompletedEvent>(),
		pagesDiscovered$: new Subject<PagesDiscoveredEvent>(),
		jobStarted$: new Subject<any>(),
		jobCompleted$: new Subject<any>(),
		jobFailed$: new Subject<any>(),
		jobCancelled$: new Subject<any>(),
	};
}

function createMockSseService(subjects: ReturnType<typeof createSseSubjects>) {
	return {
		connect: jasmine.createSpy('connect'),
		disconnect: jasmine.createSpy('disconnect'),
		connectionStatus: jasmine.createSpy('connectionStatus').and.returnValue('connected'),
		...subjects,
	};
}

function createDefaultScraperService() {
	const svc = jasmine.createSpyObj('SiteScraperService', [
		'getJob',
		'getPages',
		'retryJob',
		'requeueJob',
		'getDownloadToken',
		'getDownloadUrl',
		'getBatchPresignedUrls',
		'getScreenshotUrl',
		'getHtmlUrl',
	]);

	svc.getJob.and.returnValue(of({ status: 'ok', data: makeJob() }));
	svc.getPages.and.returnValue(
		of({
			status: 'ok',
			data: {
				page: 1,
				perPage: 100,
				numPages: 1,
				totalResults: 1,
				results: [makePage()],
			},
		}),
	);
	svc.getBatchPresignedUrls.and.returnValue(
		of({
			status: 'ok',
			data: {
				viewport: 1920,
				page: 1,
				pageSize: 50,
				totalResults: 0,
				numPages: 1,
				urls: [],
			},
		}),
	);

	return svc;
}

describe('SiteScraperJobComponent', () => {
	let component: SiteScraperJobComponent;
	let fixture: ComponentFixture<SiteScraperJobComponent>;
	let scraperService: jasmine.SpyObj<SiteScraperService>;
	let messageService: jasmine.SpyObj<MessageService>;
	let router: jasmine.SpyObj<Router>;
	let sseSubjects: ReturnType<typeof createSseSubjects>;
	let sseService: any;

	beforeEach(async () => {
		scraperService = createDefaultScraperService();
		messageService = jasmine.createSpyObj('MessageService', ['add']);
		router = jasmine.createSpyObj('Router', ['navigate']);
		sseSubjects = createSseSubjects();
		sseService = createMockSseService(sseSubjects);

		await TestBed.configureTestingModule({
			imports: [SiteScraperJobComponent],
			providers: [
				{ provide: SiteScraperService, useValue: scraperService },
				{ provide: MessageService, useValue: messageService },
				{ provide: SiteScraperSseService, useValue: sseService },
				{ provide: Router, useValue: router },
				{
					provide: ActivatedRoute,
					useValue: { snapshot: { params: { id: 'job-1' } } },
				},
			],
		})
			.overrideComponent(SiteScraperJobComponent, {
				set: { providers: [] },
			})
			.compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(SiteScraperJobComponent);
		component = fixture.componentInstance;
	});

	afterEach(() => {
		component.ngOnDestroy();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	// --- Job data loading ---

	describe('ngOnInit', () => {
		it('should load job details on init', () => {
			component.ngOnInit();
			expect(scraperService.getJob).toHaveBeenCalledWith('job-1');
			expect(component.job()).toEqual(makeJob());
		});

		it('should load pages on init', () => {
			component.ngOnInit();
			expect(scraperService.getPages).toHaveBeenCalledWith('job-1', 1, 100);
			expect(component.pages().length).toBe(1);
		});

		it('should connect to SSE on init', () => {
			component.ngOnInit();
			expect(sseService.connect).toHaveBeenCalled();
		});

		it('should handle job load error gracefully', () => {
			scraperService.getJob.and.returnValue(
				throwError(() => new Error('Not found')),
			);
			component.ngOnInit();
			expect(messageService.add).toHaveBeenCalledWith(
				jasmine.objectContaining({ severity: 'error' }),
			);
			expect(router.navigate).toHaveBeenCalledWith(['/apps/site-scraper']);
		});
	});

	// --- Download format selection ---

	describe('downloadFormats', () => {
		it('should default to all formats enabled', () => {
			const formats = component.downloadFormats();
			expect(formats.html).toBeTrue();
			expect(formats.markdown).toBeTrue();
			expect(formats.screenshots).toBeTrue();
		});
	});

	describe('toggleFormat', () => {
		it('should toggle individual format off', () => {
			component.toggleFormat('html');
			expect(component.downloadFormats().html).toBeFalse();
		});

		it('should toggle individual format back on', () => {
			component.toggleFormat('html');
			component.toggleFormat('html');
			expect(component.downloadFormats().html).toBeTrue();
		});
	});

	describe('hasSelectedFormats', () => {
		it('should return true when at least one format is selected', () => {
			expect(component.hasSelectedFormats()).toBeTrue();
		});

		it('should return false when no formats are selected', () => {
			component.toggleFormat('html');
			component.toggleFormat('markdown');
			component.toggleFormat('screenshots');
			expect(component.hasSelectedFormats()).toBeFalse();
		});
	});

	// --- startDownload ---

	describe('startDownload', () => {
		beforeEach(() => {
			component.ngOnInit();
		});

		it('should return early without request when no formats selected', () => {
			component.toggleFormat('html');
			component.toggleFormat('markdown');
			component.toggleFormat('screenshots');
			component.startDownload();
			expect(scraperService.getDownloadToken).not.toHaveBeenCalled();
		});

		it('should set downloading to true and call getDownloadToken', () => {
			scraperService.getDownloadToken.and.returnValue(
				of({ status: 'ok', data: { token: 'tok-123' } }),
			);
			scraperService.getDownloadUrl.and.returnValue('about:blank');

			component.startDownload();
			// downloading stays true (resets after 3s setTimeout)
			expect(component.downloading()).toBeTrue();
			expect(scraperService.getDownloadToken).toHaveBeenCalledWith('job-1');
		});

		it('should construct download URL with jobId, token, and all selected formats', () => {
			scraperService.getDownloadToken.and.returnValue(
				of({ status: 'ok', data: { token: 'tok-123' } }),
			);
			scraperService.getDownloadUrl.and.returnValue('about:blank');

			component.startDownload();

			expect(scraperService.getDownloadUrl).toHaveBeenCalledWith(
				'job-1',
				'tok-123',
				['html', 'markdown', 'screenshots'],
			);
		});

		it('should construct URL with only selected formats when some disabled', () => {
			scraperService.getDownloadToken.and.returnValue(
				of({ status: 'ok', data: { token: 'tok-123' } }),
			);
			scraperService.getDownloadUrl.and.returnValue('about:blank');

			component.toggleFormat('markdown'); // disable markdown
			component.startDownload();

			expect(scraperService.getDownloadUrl).toHaveBeenCalledWith(
				'job-1',
				'tok-123',
				['html', 'screenshots'],
			);
		});

		it('should reset downloading to false after 3s timeout', (done: DoneFn) => {
			jasmine.clock().install();

			scraperService.getDownloadToken.and.returnValue(
				of({ status: 'ok', data: { token: 'tok-123' } }),
			);
			scraperService.getDownloadUrl.and.returnValue('about:blank');

			component.startDownload();
			expect(component.downloading()).toBeTrue();

			jasmine.clock().tick(3000);
			expect(component.downloading()).toBeFalse();

			jasmine.clock().uninstall();
			done();
		});

		it('should show error toast and reset downloading on token failure', () => {
			scraperService.getDownloadToken.and.returnValue(
				throwError(() => new Error('token error')),
			);

			component.startDownload();

			expect(component.downloading()).toBeFalse();
			expect(messageService.add).toHaveBeenCalledWith(
				jasmine.objectContaining({
					severity: 'error',
					detail: 'Could not initiate download',
				}),
			);
		});
	});

	// --- SSE event handling ---

	describe('SSE events', () => {
		beforeEach(() => {
			component.ngOnInit();
		});

		it('should update job on PAGE_COMPLETED event for matching jobId', () => {
			sseSubjects.pageCompleted$.next({
				id: 'job-1',
				pageUrl: 'https://example.com/new',
				title: 'New Page',
				pagesCompleted: 3,
				pagesDiscovered: 10,
			});

			const job = component.job();
			expect(job?.pagesCompleted).toBe(3);
			expect(job?.pagesDiscovered).toBe(10);
		});

		it('should ignore PAGE_COMPLETED event for different jobId', () => {
			sseSubjects.pageCompleted$.next({
				id: 'other-job',
				pageUrl: 'https://example.com/other',
				title: 'Other',
				pagesCompleted: 99,
				pagesDiscovered: 100,
			});

			const job = component.job();
			expect(job?.pagesCompleted).toBe(5); // unchanged from default
		});

		it('should update discovered count on PAGES_DISCOVERED event', () => {
			sseSubjects.pagesDiscovered$.next({
				id: 'job-1',
				newUrls: ['https://example.com/a', 'https://example.com/b'],
				totalDiscovered: 20,
			});

			expect(component.job()?.pagesDiscovered).toBe(20);
		});

		it('should ignore PAGES_DISCOVERED event for different jobId', () => {
			sseSubjects.pagesDiscovered$.next({
				id: 'other-job',
				newUrls: [],
				totalDiscovered: 99,
			});

			expect(component.job()?.pagesDiscovered).toBe(5); // unchanged
		});
	});

	describe('ngOnDestroy', () => {
		it('should disconnect SSE on destroy', () => {
			component.ngOnInit();
			component.ngOnDestroy();
			expect(sseService.disconnect).toHaveBeenCalled();
		});
	});

	// --- Computed properties ---

	describe('computed properties', () => {
		it('completedPages filters only completed pages', () => {
			component.ngOnInit();
			component['pages'].set([
				makePage({ id: 'p1', status: 'completed' }),
				makePage({ id: 'p2', status: 'failed' }),
				makePage({ id: 'p3', status: 'completed' }),
			]);
			expect(component.completedPages().length).toBe(2);
		});

		it('pagesInQueue calculates correctly', () => {
			component.job.set(
				makeJob({ pagesDiscovered: 10, pagesCompleted: 3, pagesFailed: 2 }),
			);
			expect(component.pagesInQueue()).toBe(5);
		});

		it('pagesInQueue returns 0 when no job', () => {
			component.job.set(null);
			expect(component.pagesInQueue()).toBe(0);
		});

		it('canDownload returns true for completed job with pages', () => {
			component.job.set(makeJob({ status: 'completed', pagesCompleted: 3 }));
			expect(component.canDownload()).toBeTrue();
		});

		it('canDownload returns false for running job', () => {
			component.job.set(makeJob({ status: 'running', pagesCompleted: 3 }));
			expect(component.canDownload()).toBeFalse();
		});

		it('getProgress returns correct percentage', () => {
			component.job.set(makeJob({ pagesDiscovered: 10, pagesCompleted: 7 }));
			expect(component.getProgress()).toBe(70);
		});

		it('getProgress returns 0 when no pages discovered', () => {
			component.job.set(makeJob({ pagesDiscovered: 0, pagesCompleted: 0 }));
			expect(component.getProgress()).toBe(0);
		});
	});

	// --- Helper methods ---

	describe('getStatusSeverity', () => {
		it('should return success for completed', () => {
			expect(component.getStatusSeverity('completed')).toBe('success');
		});

		it('should return danger for failed', () => {
			expect(component.getStatusSeverity('failed')).toBe('danger');
		});

		it('should return info as default for unknown status', () => {
			expect(component.getStatusSeverity('unknown')).toBe('info');
		});
	});

	describe('formatStatus', () => {
		it('should replace underscores with spaces', () => {
			expect(component.formatStatus('completed_with_errors')).toBe(
				'completed with errors',
			);
		});
	});

	describe('isPending', () => {
		it('should return true when job status is pending', () => {
			component.job.set(makeJob({ status: 'pending' }));
			expect(component.isPending()).toBeTrue();
		});

		it('should return false when job status is not pending', () => {
			component.job.set(makeJob({ status: 'completed' }));
			expect(component.isPending()).toBeFalse();
		});
	});

	describe('isRetryable', () => {
		it('should return true for failed status', () => {
			component.job.set(makeJob({ status: 'failed' }));
			expect(component.isRetryable()).toBeTrue();
		});

		it('should return true for completed_with_errors', () => {
			component.job.set(makeJob({ status: 'completed_with_errors' }));
			expect(component.isRetryable()).toBeTrue();
		});

		it('should return true for cancelled status', () => {
			component.job.set(makeJob({ status: 'cancelled' }));
			expect(component.isRetryable()).toBeTrue();
		});

		it('should return false for running status', () => {
			component.job.set(makeJob({ status: 'running' }));
			expect(component.isRetryable()).toBeFalse();
		});
	});
});

describe('SiteScraperJobComponent (no jobId)', () => {
	it('should navigate away when route has no jobId', async () => {
		const scraperService = createDefaultScraperService();
		const messageService = jasmine.createSpyObj('MessageService', ['add']);
		const router = jasmine.createSpyObj('Router', ['navigate']);
		const sseSubjects = createSseSubjects();
		const sseService = createMockSseService(sseSubjects);

		await TestBed.configureTestingModule({
			imports: [SiteScraperJobComponent],
			providers: [
				{ provide: SiteScraperService, useValue: scraperService },
				{ provide: MessageService, useValue: messageService },
				{ provide: SiteScraperSseService, useValue: sseService },
				{ provide: Router, useValue: router },
				{
					provide: ActivatedRoute,
					useValue: { snapshot: { params: {} } },
				},
			],
		})
			.overrideComponent(SiteScraperJobComponent, {
				set: { providers: [] },
			})
			.compileComponents();

		const fixture = TestBed.createComponent(SiteScraperJobComponent);
		const component = fixture.componentInstance;
		component.ngOnInit();

		expect(router.navigate).toHaveBeenCalledWith(['/apps/site-scraper']);
		expect(scraperService.getJob).not.toHaveBeenCalled();
		component.ngOnDestroy();
	});
});
