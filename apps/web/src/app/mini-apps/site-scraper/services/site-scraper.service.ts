import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';

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
	error?: ScrapeError;
	createdAt: string;
	startedAt?: string;
	completedAt?: string;
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
	data: ScrapeJob[];
	meta: { total: number; limit: number; offset: number; hasMore: boolean };
}

export interface PresignedUrlResponse {
	url: string;
	expiresIn: number;
}

export interface BatchPresignedUrlResponse {
	urls: Record<string, string>;
	expiresIn: number;
}

@Injectable({ providedIn: 'root' })
export class SiteScraperService {
	private readonly http = inject(HttpClient);
	private readonly baseUrl = `${environment.apiUrl}/organization/${environment.organizationId}/apps/site-scraper`;

	createJob(data: {
		url: string;
		maxDepth?: number;
		viewports?: number[];
	}): Observable<{ status: string; data: ScrapeJob }> {
		return this.http.post<{ status: string; data: ScrapeJob }>(
			this.baseUrl,
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
	): Observable<{ status: string; data: ScrapedPage[] }> {
		return this.http.get<{ status: string; data: ScrapedPage[] }>(
			`${this.baseUrl}/jobs/${jobId}/pages`,
		);
	}

	getScreenshotUrl(
		jobId: string,
		pageId: string,
		viewport: number,
	): Observable<{ status: string; data: PresignedUrlResponse }> {
		return this.http.get<{ status: string; data: PresignedUrlResponse }>(
			`${this.baseUrl}/jobs/${jobId}/pages/${pageId}/screenshot`,
			{ params: { viewport: viewport.toString() } },
		);
	}

	getHtmlUrl(
		jobId: string,
		pageId: string,
	): Observable<{ status: string; data: PresignedUrlResponse }> {
		return this.http.get<{ status: string; data: PresignedUrlResponse }>(
			`${this.baseUrl}/jobs/${jobId}/pages/${pageId}/html`,
		);
	}

	getBatchPresignedUrls(
		jobId: string,
		s3Keys: string[],
	): Observable<{ status: string; data: BatchPresignedUrlResponse }> {
		return this.http.post<{
			status: string;
			data: BatchPresignedUrlResponse;
		}>(`${this.baseUrl}/jobs/${jobId}/presigned-urls`, { s3Keys });
	}

	getSseToken(): Observable<{ status: string; data: { token: string } }> {
		return this.http.post<{ status: string; data: { token: string } }>(
			`${this.baseUrl}/sse/token`,
			{},
		);
	}
}
