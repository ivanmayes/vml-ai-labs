import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of, throwError, Subject } from 'rxjs';

import { SiteScraperHomeComponent } from './site-scraper-home.component';
import {
	SiteScraperService,
	ScrapeJob,
	JobListResponse,
} from '../../services/site-scraper.service';
import {
	SiteScraperSseService,
	PageCompletedEvent,
	PagesDiscoveredEvent,
	JobCompletedEvent,
	JobFailedEvent,
	JobCancelledEvent,
} from '../../services/site-scraper-sse.service';
import { SessionQuery } from '../../../../state/session/session.query';

function makeJob(overrides: Partial<ScrapeJob> = {}): ScrapeJob {
	return {
		id: 'job-1',
		url: 'https://example.com',
		maxDepth: 3,
		viewports: [1920],
		status: 'completed',
		pagesDiscovered: 10,
		pagesCompleted: 10,
		pagesFailed: 0,
		pagesSkippedByDepth: 0,
		createdAt: '2026-01-15T12:00:00Z',
		...overrides,
	};
}

function makeJobListResponse(
	jobs: ScrapeJob[],
	queuePositions?: Record<string, number>,
): { status: string; data: JobListResponse } {
	return {
		status: 'ok',
		data: {
			page: 1,
			perPage: 10,
			numPages: 1,
			totalResults: jobs.length,
			results: jobs,
			queuePositions,
		},
	};
}

describe('SiteScraperHomeComponent', () => {
	let component: SiteScraperHomeComponent;
	let fixture: ComponentFixture<SiteScraperHomeComponent>;
	let scraperService: jasmine.SpyObj<SiteScraperService>;
	let messageService: jasmine.SpyObj<MessageService>;
	let router: jasmine.SpyObj<Router>;
	let sessionQuery: jasmine.SpyObj<SessionQuery>;

	let pageCompleted$: Subject<PageCompletedEvent>;
	let pagesDiscovered$: Subject<PagesDiscoveredEvent>;
	let jobStarted$: Subject<any>;
	let jobCompleted$: Subject<JobCompletedEvent>;
	let jobFailed$: Subject<JobFailedEvent>;
	let jobCancelled$: Subject<JobCancelledEvent>;
	let sseService: any;

	beforeEach(async () => {
		scraperService = jasmine.createSpyObj('SiteScraperService', [
			'getJobs',
			'getAdminJobs',
			'createJob',
			'deleteJob',
			'retryJob',
			'adminCancelJob',
		]);

		messageService = jasmine.createSpyObj('MessageService', ['add']);
		router = jasmine.createSpyObj('Router', ['navigate']);
		sessionQuery = jasmine.createSpyObj('SessionQuery', ['isAdmin']);
		sessionQuery.isAdmin.and.returnValue(false);

		pageCompleted$ = new Subject<PageCompletedEvent>();
		pagesDiscovered$ = new Subject<PagesDiscoveredEvent>();
		jobStarted$ = new Subject();
		jobCompleted$ = new Subject<JobCompletedEvent>();
		jobFailed$ = new Subject<JobFailedEvent>();
		jobCancelled$ = new Subject<JobCancelledEvent>();

		sseService = {
			connect: jasmine.createSpy('connect'),
			disconnect: jasmine.createSpy('disconnect'),
			connectionStatus: jasmine.createSpy('connectionStatus').and.returnValue('connected'),
			pageCompleted$,
			pagesDiscovered$,
			jobStarted$,
			jobCompleted$,
			jobFailed$,
			jobCancelled$,
		};

		scraperService.getJobs.and.returnValue(
			makeJobListResponse([makeJob()]) as any,
		);
		// Wrap in of() for observable
		scraperService.getJobs.and.returnValue(
			of(makeJobListResponse([makeJob()])),
		);

		await TestBed.configureTestingModule({
			imports: [SiteScraperHomeComponent],
			providers: [
				{ provide: SiteScraperService, useValue: scraperService },
				{ provide: MessageService, useValue: messageService },
				{ provide: SiteScraperSseService, useValue: sseService },
				{ provide: Router, useValue: router },
				{ provide: SessionQuery, useValue: sessionQuery },
			],
		})
			.overrideComponent(SiteScraperHomeComponent, {
				set: { providers: [] },
			})
			.compileComponents();
	});

	beforeEach(() => {
		fixture = TestBed.createComponent(SiteScraperHomeComponent);
		component = fixture.componentInstance;
	});

	afterEach(() => {
		component.ngOnDestroy();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});

	// --- Job list ---

	describe('loadJobs', () => {
		it('should load jobs on init', () => {
			component.ngOnInit();
			expect(scraperService.getJobs).toHaveBeenCalled();
			expect(component.jobs().length).toBe(1);
			expect(component.loading()).toBeFalse();
		});

		it('should set loading to false on error', () => {
			scraperService.getJobs.and.returnValue(
				throwError(() => new Error('fail')),
			);
			component.ngOnInit();
			expect(component.loading()).toBeFalse();
		});

		it('should have empty state when no jobs exist', () => {
			scraperService.getJobs.and.returnValue(
				of(makeJobListResponse([])),
			);
			component.ngOnInit();
			expect(component.jobs().length).toBe(0);
		});
	});

	describe('polling', () => {
		it('should set up refresh interval on init', fakeAsync(() => {
			component.ngOnInit();

			scraperService.getJobs.calls.reset();
			tick(15000);
			expect(scraperService.getJobs).toHaveBeenCalled();

			component.ngOnDestroy();
		}));
	});

	// --- Job creation ---

	describe('submitJob', () => {
		beforeEach(() => {
			component.ngOnInit();
		});

		it('should create job with valid URL', () => {
			scraperService.createJob.and.returnValue(
				of({ status: 'ok', data: makeJob() }),
			);
			component.formUrl = 'https://test.com';
			component.formDepth = 2;
			component.formViewports = [1920, 768];

			component.submitJob();

			expect(scraperService.createJob).toHaveBeenCalledWith({
				url: 'https://test.com',
				maxDepth: 2,
				viewports: [1920, 768],
			});
			expect(messageService.add).toHaveBeenCalledWith(
				jasmine.objectContaining({ severity: 'success' }),
			);
		});

		it('should return early when formUrl is empty', () => {
			component.formUrl = '';
			component.submitJob();
			expect(scraperService.createJob).not.toHaveBeenCalled();
		});

		it('should return early when already submitting', () => {
			component['isSubmitting'].set(true);
			component.formUrl = 'https://test.com';
			component.submitJob();
			expect(scraperService.createJob).not.toHaveBeenCalled();
		});

		it('should show error toast on creation failure', () => {
			scraperService.createJob.and.returnValue(
				throwError(() => ({ error: { data: 'Invalid URL' } })),
			);
			component.formUrl = 'https://bad-url.com';

			component.submitJob();

			expect(messageService.add).toHaveBeenCalledWith(
				jasmine.objectContaining({
					severity: 'error',
					detail: 'Invalid URL',
				}),
			);
			expect(component.isSubmitting()).toBeFalse();
		});

		it('should reset formUrl after successful creation', () => {
			scraperService.createJob.and.returnValue(
				of({ status: 'ok', data: makeJob() }),
			);
			component.formUrl = 'https://test.com';
			component.submitJob();
			expect(component.formUrl).toBe('');
		});

		it('should pass correct depth value', () => {
			scraperService.createJob.and.returnValue(
				of({ status: 'ok', data: makeJob() }),
			);
			component.formUrl = 'https://test.com';
			component.formDepth = 5;

			component.submitJob();

			expect(scraperService.createJob).toHaveBeenCalledWith(
				jasmine.objectContaining({ maxDepth: 5 }),
			);
		});

		it('should pass correct viewport value', () => {
			scraperService.createJob.and.returnValue(
				of({ status: 'ok', data: makeJob() }),
			);
			component.formUrl = 'https://test.com';
			component.formViewports = [375, 1024];

			component.submitJob();

			expect(scraperService.createJob).toHaveBeenCalledWith(
				jasmine.objectContaining({ viewports: [375, 1024] }),
			);
		});

		it('should default viewports to [1920] when empty', () => {
			scraperService.createJob.and.returnValue(
				of({ status: 'ok', data: makeJob() }),
			);
			component.formUrl = 'https://test.com';
			component.formViewports = [];

			component.submitJob();

			expect(scraperService.createJob).toHaveBeenCalledWith(
				jasmine.objectContaining({ viewports: [1920] }),
			);
		});
	});

	// --- SSE page count updates ---

	describe('SSE events', () => {
		beforeEach(() => {
			component.ngOnInit();
		});

		it('should update page count on PAGE_COMPLETED event', () => {
			pageCompleted$.next({
				id: 'job-1',
				pageUrl: 'https://example.com/new',
				title: 'New',
				pagesCompleted: 7,
				pagesDiscovered: 10,
			});

			const job = component.jobs().find((j) => j.id === 'job-1');
			expect(job?.pagesCompleted).toBe(7);
			expect(job?.pagesDiscovered).toBe(10);
		});

		it('should update discovered count on PAGES_DISCOVERED event', () => {
			pagesDiscovered$.next({
				id: 'job-1',
				newUrls: ['https://example.com/a'],
				totalDiscovered: 20,
			});

			const job = component.jobs().find((j) => j.id === 'job-1');
			expect(job?.pagesDiscovered).toBe(20);
		});

		it('should update status on JOB_COMPLETED event', () => {
			jobCompleted$.next({
				id: 'job-1',
				status: 'completed_with_errors',
				pagesCompleted: 8,
				pagesFailed: 2,
				pagesDiscovered: 10,
				pagesSkippedByDepth: 0,
			});

			const job = component.jobs().find((j) => j.id === 'job-1');
			expect(job?.status).toBe('completed_with_errors');
			expect(job?.pagesFailed).toBe(2);
		});

		it('should show toast on JOB_COMPLETED event', () => {
			jobCompleted$.next({
				id: 'job-1',
				status: 'completed',
				pagesCompleted: 10,
				pagesFailed: 0,
				pagesDiscovered: 10,
				pagesSkippedByDepth: 0,
			});

			expect(messageService.add).toHaveBeenCalledWith(
				jasmine.objectContaining({
					severity: 'success',
					summary: 'Scrape Complete',
				}),
			);
		});

		it('should update status on JOB_FAILED event', () => {
			jobFailed$.next({
				id: 'job-1',
				status: 'failed',
				error: {
					code: 'ERR',
					message: 'Something went wrong',
					retryable: false,
					timestamp: '2026-01-01T00:00:00Z',
				},
			});

			const job = component.jobs().find((j) => j.id === 'job-1');
			expect(job?.status).toBe('failed');
		});

		it('should update status on JOB_CANCELLED event', () => {
			jobCancelled$.next({
				id: 'job-1',
				status: 'cancelled',
			});

			const job = component.jobs().find((j) => j.id === 'job-1');
			expect(job?.status).toBe('cancelled');
		});

		it('should refresh jobs when SSE event references unknown job', () => {
			scraperService.getJobs.calls.reset();
			pageCompleted$.next({
				id: 'unknown-job',
				pageUrl: 'https://example.com/x',
				title: null,
				pagesCompleted: 1,
				pagesDiscovered: 1,
			});

			// updateJobInList finds no match, triggers refreshJobs
			expect(scraperService.getJobs).toHaveBeenCalled();
		});
	});

	// --- Page count display ---

	describe('page count display', () => {
		it('should show zero pages when discovered is 0', () => {
			component.ngOnInit();
			const zeroJob = makeJob({
				pagesDiscovered: 0,
				pagesCompleted: 0,
			});
			component['jobs'].set([zeroJob]);
			expect(component.getProgress(zeroJob)).toBe(0);
		});

		it('should calculate progress percentage correctly', () => {
			const job = makeJob({ pagesDiscovered: 20, pagesCompleted: 10 });
			expect(component.getProgress(job)).toBe(50);
		});

		it('should show 100% for fully completed job', () => {
			const job = makeJob({ pagesDiscovered: 10, pagesCompleted: 10 });
			expect(component.getProgress(job)).toBe(100);
		});
	});

	// --- Admin view ---

	describe('admin view', () => {
		it('should load admin jobs when user is admin', () => {
			sessionQuery.isAdmin.and.returnValue(true);
			scraperService.getAdminJobs.and.returnValue(
				of({
					status: 'ok',
					data: {
						page: 1,
						perPage: 50,
						numPages: 1,
						totalResults: 1,
						results: [{ ...makeJob(), userId: 'u1', userEmail: 'admin@test.com' }],
						queuePositions: undefined,
					},
				}),
			);

			component.ngOnInit();
			expect(scraperService.getAdminJobs).toHaveBeenCalled();
			expect(component.adminJobs().length).toBe(1);
		});

		it('should not load admin jobs when user is not admin', () => {
			sessionQuery.isAdmin.and.returnValue(false);
			component.ngOnInit();
			expect(scraperService.getAdminJobs).not.toHaveBeenCalled();
		});
	});

	// --- Navigation ---

	describe('navigation', () => {
		it('should navigate to job detail on viewJob', () => {
			const job = makeJob({ id: 'job-99' });
			component.viewJob(job);
			expect(router.navigate).toHaveBeenCalledWith([
				'/apps/site-scraper',
				'job-99',
			]);
		});

		it('should navigate to job detail on row select', () => {
			const job = makeJob({ id: 'job-42' });
			component.onRowSelect({ data: job });
			expect(router.navigate).toHaveBeenCalledWith([
				'/apps/site-scraper',
				'job-42',
			]);
		});

		it('should not navigate on row select with array data', () => {
			component.onRowSelect({ data: [makeJob()] });
			expect(router.navigate).not.toHaveBeenCalled();
		});
	});

	// --- Helper methods ---

	describe('getStatusSeverity', () => {
		it('should return success for completed', () => {
			expect(component.getStatusSeverity('completed')).toBe('success');
		});

		it('should return warn for completed_with_errors', () => {
			expect(component.getStatusSeverity('completed_with_errors')).toBe('warn');
		});

		it('should return danger for failed', () => {
			expect(component.getStatusSeverity('failed')).toBe('danger');
		});

		it('should return info as default', () => {
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

	describe('ngOnDestroy', () => {
		it('should disconnect SSE on destroy', () => {
			component.ngOnInit();
			component.ngOnDestroy();
			expect(sseService.disconnect).toHaveBeenCalled();
		});
	});
});
