import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, shareReplay, tap, catchError, map } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface OrganizationApp {
	id: string;
	organizationId: string;
	appKey: string;
	enabled: boolean;
	settings: Record<string, unknown>;
}

@Injectable({
	providedIn: 'root',
})
export class OrganizationAppService {
	private readonly _enabledApps = signal<OrganizationApp[] | undefined>(
		undefined,
	);
	public readonly enabledApps = this._enabledApps.asReadonly();

	/** In-flight request, shared so concurrent callers reuse the same HTTP call. */
	private _inflight$: Observable<OrganizationApp[]> | null = null;

	constructor(private readonly http: HttpClient) {}

	/**
	 * Loads enabled apps from the API, updates the signal, and returns an
	 * observable of the result. Concurrent calls share the same HTTP request.
	 * Existing fire-and-forget callers can continue to ignore the return value.
	 */
	loadEnabledApps(): Observable<OrganizationApp[]> {
		if (this._inflight$) {
			return this._inflight$;
		}

		this._inflight$ = this.http
			.get<{
				status: string;
				data: OrganizationApp[];
			}>(`${environment.apiUrl}/organization-app/enabled`)
			.pipe(
				map((response) => response.data || []),
				tap((apps) => {
					this._enabledApps.set(apps);
					this._inflight$ = null;
				}),
				catchError(() => {
					this._enabledApps.set([]);
					this._inflight$ = null;
					return of([] as OrganizationApp[]);
				}),
				shareReplay(1),
			);

		// Subscribe to kick off the request for fire-and-forget callers
		this._inflight$.subscribe();

		return this._inflight$;
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
