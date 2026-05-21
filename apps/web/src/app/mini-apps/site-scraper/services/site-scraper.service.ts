import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import type {
	EventHint,
	UrlHintGroup,
	HintConfig,
} from '@api/mini-apps/site-scraper/types/event-hint.types';
import { environment } from '../../../../environments/environment';

export type { EventHint, UrlHintGroup, HintConfig };

export type JobStatus =
	| 'pending'
	| 'running'
	| 'completed'
	| 'completed_with_errors'
	| 'failed'
	| 'cancelled';

export type PageStatus = 'pending' | 'completed' | 'failed';

export interface ScrapeError {
	code: string;
	message: string;
	retryable: boolean;
	timestamp: string;
}

export interface ScreenshotRecord {
	viewport: number;
	s3Key: string;
	thumbnailS3Key?: string;
	/** Human-readable label from the hint that produced this screenshot */
	hintLabel?: string;
	/** Index of the hint in the resolved hints array */
	hintIndex?: number;
	/** Whether this screenshot is a baseline, before-hint, or after-hint capture */
	snapshotTiming?: 'baseline' | 'before' | 'after';
}

export interface ScrapeJob {
	id: string;
	url: string;
	maxDepth: number;
	viewports: number[];
	status: JobStatus;
	pagesDiscovered: number;
	pagesCompleted: number;
	pagesFailed: number;
	pagesSkippedByDepth: number;
	error?: ScrapeError;
	createdAt: string;
	startedAt?: string;
	completedAt?: string;
	queuePosition?: number | null;
}

export interface ScrapedPage {
	id: string;
	scrapeJobId: string;
	url: string;
	title: string | null;
	htmlS3Key: string | null;
	screenshots: ScreenshotRecord[];
	status: PageStatus;
	errorMessage: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface JobListResponse {
	page: number;
	perPage: number;
	numPages: number;
	totalResults: number;
	results: ScrapeJob[];
	queuePositions?: Record<string, number>;
}

export interface AdminScrapeJob extends ScrapeJob {
	userId: string;
	userEmail?: string;
}

export interface AdminJobListResponse {
	page: number;
	perPage: number;
	numPages: number;
	totalResults: number;
	results: AdminScrapeJob[];
	queuePositions?: Record<string, number>;
}

export interface PresignedUrlResponse {
	presignedUrl: string;
}

export interface BatchPresignedUrlItem {
	pageId: string;
	url: string;
	title: string | null;
	presignedUrl: string | null;
}

export interface BatchPresignedUrlResponse {
	viewport: number;
	page: number;
	pageSize: number;
	totalResults: number;
	numPages: number;
	urls: BatchPresignedUrlItem[];
}

@Injectable({ providedIn: 'root' })
export class SiteScraperService {
	private readonly http = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/organization/${environment.organizationId}/apps/site-scraper`;

	createJob(data: {
		url: string;
		maxDepth?: number;
		viewports?: number[];
		hints?: HintConfig;
	}): Observable<{ status: string; data: ScrapeJob }> {
		return this.http.post<{ status: string; data: ScrapeJob }>(
			`${this.baseUrl}/jobs`,
			data,
		);
	}

	getJobs(
		status?: string,
	): Observable<{ status: string; data: JobListResponse }> {
		const params: Record<string, string> = {};
		if (status) params['status'] = status;
		return this.http.get<{ status: string; data: JobListResponse }>(
			`${this.baseUrl}/jobs`,
			{ params },
		);
	}

	getJob(id: string): Observable<{ status: string; data: ScrapeJob }> {
		return this.http.get<{ status: string; data: ScrapeJob }>(
			`${this.baseUrl}/jobs/${id}`,
		);
	}

	retryJob(id: string): Observable<{ status: string; data: ScrapeJob }> {
		return this.http.post<{ status: string; data: ScrapeJob }>(
			`${this.baseUrl}/jobs/${id}/retry`,
			{},
		);
	}

	requeueJob(id: string): Observable<{ status: string; data: ScrapeJob }> {
		return this.http.post<{ status: string; data: ScrapeJob }>(
			`${this.baseUrl}/jobs/${id}/requeue`,
			{},
		);
	}

	deleteJob(
		id: string,
	): Observable<{ status: string; data: { id: string; status: string } }> {
		return this.http.delete<{
			status: string;
			data: { id: string; status: string };
		}>(`${this.baseUrl}/jobs/${id}`);
	}

	getPages(
		jobId: string,
		page = 1,
		perPage = 100,
	): Observable<{
		status: string;
		data: {
			page: number;
			perPage: number;
			numPages: number;
			totalResults: number;
			results: ScrapedPage[];
		};
	}> {
		return this.http.get<{
			status: string;
			data: {
				page: number;
				perPage: number;
				numPages: number;
				totalResults: number;
				results: ScrapedPage[];
			};
		}>(`${this.baseUrl}/jobs/${jobId}/pages`, {
			params: {
				page: page.toString(),
				perPage: perPage.toString(),
			},
		});
	}

	getScreenshotUrl(
		pageId: string,
		viewport: number,
		s3Key?: string,
	): Observable<{ status: string; data: PresignedUrlResponse }> {
		const params: Record<string, string> = {
			viewport: viewport.toString(),
		};
		if (s3Key) {
			params['s3Key'] = s3Key;
		}
		return this.http.get<{ status: string; data: PresignedUrlResponse }>(
			`${this.baseUrl}/pages/${pageId}/screenshot`,
			{ params },
		);
	}

	getHtmlUrl(
		pageId: string,
	): Observable<{ status: string; data: PresignedUrlResponse }> {
		return this.http.get<{ status: string; data: PresignedUrlResponse }>(
			`${this.baseUrl}/pages/${pageId}/html`,
		);
	}

	getBatchPresignedUrls(
		jobId: string,
		viewport: number,
		page = 1,
		pageSize = 50,
	): Observable<{ status: string; data: BatchPresignedUrlResponse }> {
		return this.http.get<{
			status: string;
			data: BatchPresignedUrlResponse;
		}>(`${this.baseUrl}/jobs/${jobId}/presigned-urls`, {
			params: {
				viewport: viewport.toString(),
				page: page.toString(),
				pageSize: pageSize.toString(),
			},
		});
	}

	getDownloadToken(
		jobId: string,
	): Observable<{ status: string; data: { token: string } }> {
		return this.http.post<{ status: string; data: { token: string } }>(
			`${this.baseUrl}/jobs/${jobId}/download-token`,
			{},
		);
	}

	getDownloadUrl(jobId: string, token: string, formats: string[]): string {
		const format = formats.join(',');
		return `${this.baseUrl}/jobs/${jobId}/download?token=${encodeURIComponent(token)}&format=${encodeURIComponent(format)}`;
	}

	getSseToken(): Observable<{ status: string; data: { token: string } }> {
		return this.http.post<{ status: string; data: { token: string } }>(
			`${this.baseUrl}/sse-token`,
			{},
		);
	}

	getAdminJobs(): Observable<{
		status: string;
		data: AdminJobListResponse;
	}> {
		return this.http.get<{ status: string; data: AdminJobListResponse }>(
			`${this.baseUrl}/jobs/admin`,
			{ params: { perPage: '50' } },
		);
	}

	adminCancelJob(
		jobId: string,
	): Observable<{ status: string; data: AdminScrapeJob }> {
		return this.http.post<{ status: string; data: AdminScrapeJob }>(
			`${this.baseUrl}/jobs/${jobId}/admin/cancel`,
			{},
		);
	}
}
