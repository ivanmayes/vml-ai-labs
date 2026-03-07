import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../environments/environment';

export interface OrganizationApp {
	id: string;
	organizationId: string;
	appKey: string;
	enabled: boolean;
	settings: Record<string, any>;
}

@Injectable({
	providedIn: 'root',
})
export class OrganizationAppService {
	private readonly _enabledApps = signal<OrganizationApp[] | undefined>(
		undefined,
	);
	public readonly enabledApps = this._enabledApps.asReadonly();

	constructor(private readonly http: HttpClient) {}

	loadEnabledApps() {
		this.http
			.get<{
				status: string;
				data: OrganizationApp[];
			}>(`${environment.apiUrl}/organization-app/enabled`)
			.subscribe({
				next: (response) => {
					this._enabledApps.set(response.data || []);
				},
				error: () => {
					this._enabledApps.set([]);
				},
			});
	}

	toggleApp(appKey: string, enabled: boolean) {
		return this.http.post(`${environment.apiUrl}/organization-app/toggle`, {
			appKey,
			enabled,
		});
	}

	isAppEnabled(appKey: string): boolean {
		const apps = this._enabledApps();
		if (!apps) return false;
		return apps.some((app) => app.appKey === appKey && app.enabled);
	}
}
