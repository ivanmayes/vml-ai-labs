import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../../environments/environment';

@Injectable({
	providedIn: 'root',
})
export class WppOpenAgentUpdaterService {
	private readonly apiUrl = `${environment.apiUrl}/apps/wpp-open-agent-updater`;

	constructor(private readonly http: HttpClient) {}

	find(filter: Record<string, any> = {}, page = 1, perPage = 10) {
		return this.http.post(
			`${this.apiUrl}/find?page=${page}&perPage=${perPage}`,
			filter,
		);
	}

	create(data: Record<string, any>) {
		return this.http.post(this.apiUrl, data);
	}

	update(id: string, data: Record<string, any>) {
		return this.http.put(`${this.apiUrl}/${id}`, data);
	}

	delete(id: string) {
		return this.http.delete(`${this.apiUrl}/${id}`);
	}
}
