import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ConversionJob {
	id: string;
	fileName: string;
	fileSize: number;
	status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
	engine?: string;
	createdAt: string;
	startedAt?: string;
	completedAt?: string;
	processingTimeMs?: number;
	outputSize?: number;
	queuePosition?: number;
	error?: { code: string; message: string; retryable: boolean };
}

export interface JobListResponse {
	data: ConversionJob[];
	meta: { total: number; limit: number; offset: number; hasMore: boolean };
}

export interface DownloadResponse {
	downloadUrl: string;
	fileName: string;
	fileSize: number;
	expiresAt: string;
	urlExpiresIn: number;
}

@Injectable({ providedIn: 'root' })
export class DocumentConverterService {
	private readonly http = inject(HttpClient);
	private readonly baseUrl = '/api/apps/document-converter';

	uploadFile(
		file: File,
		idempotencyKey?: string,
	): Observable<{ status: string; data: ConversionJob }> {
		const formData = new FormData();
		formData.append('file', file);
		const headers: Record<string, string> = {};
		if (idempotencyKey) {
			headers['Idempotency-Key'] = idempotencyKey;
		}
		return this.http.post<{ status: string; data: ConversionJob }>(
			this.baseUrl,
			formData,
			{ headers },
		);
	}

	listJobs(
		status?: string,
	): Observable<{ status: string; data: JobListResponse }> {
		const params: Record<string, string> = {};
		if (status) params['status'] = status;
		return this.http.post<{ status: string; data: JobListResponse }>(
			`${this.baseUrl}/find`,
			params,
		);
	}

	getJob(id: string): Observable<{ status: string; data: ConversionJob }> {
		return this.http.get<{ status: string; data: ConversionJob }>(
			`${this.baseUrl}/jobs/${id}`,
		);
	}

	getDownloadUrl(
		id: string,
	): Observable<{ status: string; data: DownloadResponse }> {
		return this.http.get<{ status: string; data: DownloadResponse }>(
			`${this.baseUrl}/jobs/${id}/download`,
		);
	}

	cancelJob(id: string): Observable<{ status: string; data: any }> {
		return this.http.delete<{ status: string; data: any }>(
			`${this.baseUrl}/jobs/${id}`,
		);
	}

	retryJob(id: string): Observable<{ status: string; data: any }> {
		return this.http.post<{ status: string; data: any }>(
			`${this.baseUrl}/jobs/${id}/retry`,
			{},
		);
	}
}
