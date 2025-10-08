import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Space, CreateSpaceDto, UpdateSpaceDto } from '../models/space.model';

@Injectable({
	providedIn: 'root'
})
export class SpaceService {
	private readonly apiUrl = environment.apiUrl;
	private readonly defaultHeaders = new HttpHeaders({
		'Accept': 'application/json'
	});

	constructor(private readonly http: HttpClient) {}

	getSpaces(orgId: string): Observable<any> {
		return this.http.get<any>(
			`${this.apiUrl}/organization/${orgId}/admin/spaces`,
			{ headers: this.defaultHeaders }
		);
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
}
