import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SpaceUser, InviteSpaceUserDto, UpdateSpaceUserRoleDto } from '../models/space-user.model';

@Injectable({
	providedIn: 'root'
})
export class SpaceUserService {
	private apiUrl = environment.apiUrl;

	constructor(private http: HttpClient) {}

	getSpaceUsers(
		spaceId: string,
		query?: string,
		sortBy?: string,
		order?: string,
		page?: number,
		limit?: number
	): Observable<any> {
		let params = new HttpParams();

		if (query) {
			params = params.set('query', query);
		}
		if (sortBy) {
			params = params.set('sortBy', sortBy);
		}
		if (order) {
			params = params.set('order', order);
		}
		if (page !== undefined) {
			params = params.set('page', page.toString());
		}
		if (limit !== undefined) {
			params = params.set('limit', limit.toString());
		}

		return this.http.get<any>(
			`${this.apiUrl}/space/${spaceId}/users`,
			{ params }
		);
	}

	inviteUser(spaceId: string, dto: InviteSpaceUserDto): Observable<any> {
		return this.http.post<any>(
			`${this.apiUrl}/space/${spaceId}/users`,
			dto
		);
	}

	updateUserRole(spaceId: string, userId: string, dto: UpdateSpaceUserRoleDto): Observable<any> {
		return this.http.patch<any>(
			`${this.apiUrl}/space/${spaceId}/users/${userId}`,
			dto
		);
	}

	removeUser(spaceId: string, userId: string): Observable<any> {
		return this.http.delete<any>(
			`${this.apiUrl}/space/${spaceId}/users/${userId}`
		);
	}
}
