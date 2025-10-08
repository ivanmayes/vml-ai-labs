import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Space, CreateSpaceDto, UpdateSpaceDto, SpaceUpdateSettingsDto, SpacePublicDetailsDto } from '../models/space.model';

@Injectable({
	providedIn: 'root'
})
export class SpaceService {
	private readonly apiUrl = environment.apiUrl;
	private readonly defaultHeaders = new HttpHeaders({
		'Accept': 'application/json'
	});

	constructor(private readonly http: HttpClient) {}

	getSpaces(orgId: string, query?: string, sortBy?: string, order?: string): Observable<any> {
		let url = `${this.apiUrl}/organization/${orgId}/admin/spaces`;
		const params: string[] = [];

		if (query) {
			params.push(`query=${encodeURIComponent(query)}`);
		}
		if (sortBy) {
			params.push(`sortBy=${sortBy}`);
		}
		if (order) {
			params.push(`order=${order}`);
		}

		if (params.length > 0) {
			url += '?' + params.join('&');
		}

		return this.http.get<any>(url, { headers: this.defaultHeaders });
	}

	createSpace(orgId: string, dto: CreateSpaceDto): Observable<any> {
		return this.http.post<any>(
			`${this.apiUrl}/organization/${orgId}/admin/spaces`,
			dto,
			{ headers: this.defaultHeaders }
		);
	}

	updateSpace(orgId: string, spaceId: string, dto: UpdateSpaceDto): Observable<any> {
		return this.http.put<any>(
			`${this.apiUrl}/organization/${orgId}/admin/spaces/${spaceId}`,
			dto,
			{ headers: this.defaultHeaders }
		);
	}

	deleteSpace(orgId: string, spaceId: string): Observable<any> {
		return this.http.delete<any>(
			`${this.apiUrl}/organization/${orgId}/admin/spaces/${spaceId}`,
			{ headers: this.defaultHeaders }
		);
	}

	updateSettings(orgId: string, spaceId: string, dto: SpaceUpdateSettingsDto): Observable<any> {
		return this.http.put<any>(
			`${this.apiUrl}/organization/${orgId}/admin/spaces/${spaceId}/settings`,
			dto,
			{ headers: this.defaultHeaders }
		);
	}

	getSpace(spaceId: string): Observable<any> {
		return this.http.get<any>(
			`${this.apiUrl}/spaces/${spaceId}`,
			{ headers: this.defaultHeaders }
		);
	}

	getPublicDetails(spaceId: string): Observable<any> {
		return this.http.get<any>(
			`${this.apiUrl}/spaces/${spaceId}/public`,
			{ headers: this.defaultHeaders }
		);
	}
}
