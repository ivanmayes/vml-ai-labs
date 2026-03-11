import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import type { PublicProject } from '@api/project/project.entity';
import type { ProjectCreateDto, ProjectUpdateDto } from '@api/project/dtos';

import { environment } from '../../../environments/environment';

interface ResponseEnvelope<T> {
	status: string;
	data: T;
	message?: string;
}

interface FindResponse<T> {
	page: number;
	perPage: number;
	numPages: number;
	totalResults: number;
	results: T[];
}

export type { PublicProject, ProjectCreateDto, ProjectUpdateDto };

@Injectable({
	providedIn: 'root',
})
export class ProjectService {
	private readonly baseUrl = `${environment.apiUrl}/project`;

	constructor(private readonly http: HttpClient) {}

	findProjects(
		filter: Partial<Pick<PublicProject, 'organizationId' | 'spaceId'>> = {},
	): Observable<FindResponse<PublicProject>> {
		return this.http
			.post<
				ResponseEnvelope<FindResponse<PublicProject>>
			>(`${this.baseUrl}/find`, filter)
			.pipe(map((res) => res.data));
	}

	getProject(id: string): Observable<PublicProject> {
		return this.http
			.get<ResponseEnvelope<PublicProject>>(`${this.baseUrl}/${id}`)
			.pipe(map((res) => res.data));
	}

	createProject(dto: ProjectCreateDto): Observable<PublicProject> {
		return this.http
			.post<ResponseEnvelope<PublicProject>>(this.baseUrl, dto)
			.pipe(map((res) => res.data));
	}

	updateProject(
		id: string,
		dto: ProjectUpdateDto,
	): Observable<PublicProject> {
		return this.http
			.put<ResponseEnvelope<PublicProject>>(`${this.baseUrl}/${id}`, dto)
			.pipe(map((res) => res.data));
	}

	deleteProject(id: string): Observable<void> {
		return this.http
			.delete<ResponseEnvelope<void>>(`${this.baseUrl}/${id}`)
			.pipe(map((res) => res.data));
	}
}
