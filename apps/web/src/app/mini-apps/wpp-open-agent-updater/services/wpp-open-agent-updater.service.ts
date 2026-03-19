import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { environment } from '../../../../environments/environment';

export interface UpdaterTask {
	id: string;
	name: string;
	boxFolderId: string;
	boxFolderName?: string;
	wppOpenAgentId: string;
	wppOpenAgentName?: string;
	wppOpenProjectId: string;
	status: 'active' | 'paused' | 'archived';
	lastRunAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface TaskRun {
	id: string;
	taskId: string;
	status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
	startedAt: string | null;
	completedAt: string | null;
	filesFound: number;
	filesProcessed: number;
	filesFailed: number;
	filesSkipped: number;
	errorMessage: string | null;
	createdAt: string;
	files?: TaskRunFile[];
}

export interface TaskRunFile {
	id: string;
	taskRunId: string;
	boxFileId: string;
	fileName: string;
	fileSize: number;
	status:
		| 'pending'
		| 'downloading'
		| 'converting'
		| 'uploading'
		| 'completed'
		| 'failed';
	errorMessage: string | null;
	processedAt: string | null;
	createdAt: string;
}

export interface BoxFolderInfo {
	name: string;
	fileCount: number;
}

export interface WppOpenAgent {
	id: string;
	name: string;
	description?: string;
	category?: string;
}

interface ApiResponse<T> {
	status: string;
	message?: string;
	data?: T;
}

@Injectable({
	providedIn: 'root',
})
export class WppOpenAgentUpdaterService {
	private readonly apiUrl = `${environment.apiUrl}/organization/${environment.organizationId}/apps/wpp-open-agent-updater`;

	constructor(private readonly http: HttpClient) {}

	// ── Tasks ──────────────────────────────────────────────────

	createTask(data: {
		name: string;
		boxFolderId: string;
		wppOpenAgentId: string;
		wppOpenProjectId: string;
		wppOpenToken?: string;
	}): Observable<UpdaterTask> {
		return this.http
			.post<ApiResponse<UpdaterTask>>(`${this.apiUrl}/tasks`, data)
			.pipe(map((res) => res.data!));
	}

	listTasks(): Observable<UpdaterTask[]> {
		return this.http
			.get<ApiResponse<UpdaterTask[]>>(`${this.apiUrl}/tasks`)
			.pipe(map((res) => res.data!));
	}

	getTask(id: string): Observable<UpdaterTask> {
		return this.http
			.get<ApiResponse<UpdaterTask>>(`${this.apiUrl}/tasks/${id}`)
			.pipe(map((res) => res.data!));
	}

	updateTask(
		id: string,
		data: { name?: string; status?: string },
	): Observable<UpdaterTask> {
		return this.http
			.put<ApiResponse<UpdaterTask>>(`${this.apiUrl}/tasks/${id}`, data)
			.pipe(map((res) => res.data!));
	}

	deleteTask(id: string): Observable<void> {
		return this.http
			.delete<ApiResponse<void>>(`${this.apiUrl}/tasks/${id}`)
			.pipe(map(() => undefined));
	}

	// ── Runs ───────────────────────────────────────────────────

	triggerRun(taskId: string, wppOpenToken: string): Observable<TaskRun> {
		return this.http
			.post<
				ApiResponse<TaskRun>
			>(`${this.apiUrl}/tasks/${taskId}/run`, { wppOpenToken })
			.pipe(map((res) => res.data!));
	}

	listRuns(taskId: string): Observable<TaskRun[]> {
		return this.http
			.get<ApiResponse<TaskRun[]>>(`${this.apiUrl}/tasks/${taskId}/runs`)
			.pipe(map((res) => res.data!));
	}

	getRun(runId: string): Observable<TaskRun> {
		return this.http
			.get<ApiResponse<TaskRun>>(`${this.apiUrl}/runs/${runId}`)
			.pipe(map((res) => res.data!));
	}

	// ── Integration ────────────────────────────────────────────

	validateBoxFolder(folderId: string): Observable<BoxFolderInfo> {
		return this.http
			.get<
				ApiResponse<BoxFolderInfo>
			>(`${this.apiUrl}/box/validate/${folderId}`)
			.pipe(map((res) => res.data!));
	}

	listAgents(projectId: string, token: string): Observable<WppOpenAgent[]> {
		return this.http
			.get<
				ApiResponse<WppOpenAgent[]>
			>(`${this.apiUrl}/agents?projectId=${projectId}&token=${token}`)
			.pipe(map((res) => res.data!));
	}
}
