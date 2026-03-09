import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface MiniAppManifestEntry {
	key: string;
	displayName: string;
	description: string;
	icon: string;
	defaultEnabled: boolean;
	route: string;
	apiPrefix: string;
}

export interface MiniAppManifest {
	apps: MiniAppManifestEntry[];
}

@Injectable({
	providedIn: 'root',
})
export class MiniAppManifestService {
	private readonly _apps = signal<MiniAppManifestEntry[]>([]);
	public readonly apps = this._apps.asReadonly();

	private loaded = false;

	constructor(private readonly http: HttpClient) {}

	loadManifest(): void {
		if (this.loaded) return;
		this.loaded = true;

		this.http.get<MiniAppManifest>('/assets/mini-apps.json').subscribe({
			next: (manifest) => {
				this._apps.set(manifest.apps || []);
			},
			error: () => {
				// Fallback: read from the embedded manifest
				this._apps.set([]);
			},
		});
	}

	getApp(key: string): MiniAppManifestEntry | undefined {
		return this._apps().find((app) => app.key === key);
	}
}
