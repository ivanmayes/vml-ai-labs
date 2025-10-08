import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PromoteUserDto {
	userId: string;
	targetRole: string;
}

export interface BanUserDto {
	userId: string;
	banned: boolean;
}

@Injectable({
	providedIn: 'root'
})
export class OrganizationAdminService {
	private readonly apiUrl = environment.apiUrl;
	private readonly defaultHeaders = new HttpHeaders({
		'Accept': 'application/json'
	});

	constructor(private readonly http: HttpClient) {}

	getUsers(orgId: string, sortBy?: string, order?: string): Observable<any> {
		let url = `${this.apiUrl}/admin/organization/${orgId}/user`;
		const params: string[] = [];

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

	promoteUser(orgId: string, dto: PromoteUserDto): Observable<any> {
		return this.http.post<any>(
			`${this.apiUrl}/admin/organization/${orgId}/user/promote`,
			dto,
			{ headers: this.defaultHeaders }
		);
	}

	banUser(orgId: string, dto: BanUserDto): Observable<any> {
		return this.http.post<any>(
			`${this.apiUrl}/admin/organization/${orgId}/user/ban`,
			dto,
			{ headers: this.defaultHeaders }
		);
	}

	inviteUser(orgId: string, email: string, role: string, authenticationStrategyId: string, profile: any): Observable<any> {
		return this.http.post<any>(
			`${this.apiUrl}/admin/organization/${orgId}/user`,
			{
				email,
				role,
				authenticationStrategyId,
				profile,
				deactivated: false
			},
			{ headers: this.defaultHeaders }
		);
	}
}
