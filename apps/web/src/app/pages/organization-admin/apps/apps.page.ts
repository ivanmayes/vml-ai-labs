import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	computed,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';

import { PrimeNgModule } from '../../../shared/primeng.module';
import {
	MiniAppManifestService,
	MiniAppManifestEntry,
} from '../../../shared/services/mini-app-manifest.service';
import {
	OrganizationAppService,
	OrganizationApp,
} from '../../../shared/services/organization-app.service';

interface AppRow {
	manifest: MiniAppManifestEntry;
	enabled: boolean;
	saving: boolean;
}

@Component({
	selector: 'app-org-admin-apps',
	templateUrl: './apps.page.html',
	styleUrls: ['./apps.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, FormsModule, PrimeNgModule],
})
export class AppsPage implements OnInit {
	loading = signal(true);

	/**
	 * Internal signal tracking per-app saving state by key.
	 */
	private readonly savingKeys = signal<Set<string>>(new Set());

	/**
	 * Internal signal tracking local enabled overrides (for optimistic UI).
	 */
	private readonly localOverrides = signal<Map<string, boolean>>(new Map());

	/**
	 * Computed list that merges manifest data with the org's enabled/disabled state.
	 */
	readonly appRows = computed<AppRow[]>(() => {
		const allApps = this.manifestService.apps();
		const orgApps = this.orgAppService.enabledApps();
		const saving = this.savingKeys();
		const overrides = this.localOverrides();

		if (!allApps.length) return [];

		return allApps.map((manifest) => {
			// Check local override first, then org state, then default
			let enabled: boolean;
			if (overrides.has(manifest.key)) {
				enabled = overrides.get(manifest.key)!;
			} else if (orgApps !== undefined) {
				enabled = orgApps.some(
					(oa: OrganizationApp) =>
						oa.appKey === manifest.key && oa.enabled,
				);
			} else {
				enabled = manifest.defaultEnabled;
			}

			return {
				manifest,
				enabled,
				saving: saving.has(manifest.key),
			};
		});
	});

	constructor(
		private readonly manifestService: MiniAppManifestService,
		private readonly orgAppService: OrganizationAppService,
		private readonly messageService: MessageService,
	) {}

	ngOnInit(): void {
		this.manifestService.loadManifest();
		this.orgAppService.loadEnabledApps();

		// Mark loading as done once org apps are resolved
		// Use a simple interval check since we're zoneless
		const checkInterval = setInterval(() => {
			if (this.orgAppService.enabledApps() !== undefined) {
				this.loading.set(false);
				clearInterval(checkInterval);
			}
		}, 100);

		// Safety: stop checking after 10 seconds
		setTimeout(() => {
			clearInterval(checkInterval);
			this.loading.set(false);
		}, 10000);
	}

	onToggleApp(appKey: string, enabled: boolean): void {
		// Optimistic update
		this.localOverrides.update((map) => {
			const next = new Map(map);
			next.set(appKey, enabled);
			return next;
		});

		this.savingKeys.update((set) => {
			const next = new Set(set);
			next.add(appKey);
			return next;
		});

		this.orgAppService.toggleApp(appKey, enabled).subscribe({
			next: () => {
				this.savingKeys.update((set) => {
					const next = new Set(set);
					next.delete(appKey);
					return next;
				});

				// Refresh the enabled apps list from server
				this.orgAppService.loadEnabledApps();

				// Clear the local override so server state takes over
				this.localOverrides.update((map) => {
					const next = new Map(map);
					next.delete(appKey);
					return next;
				});

				this.messageService.add({
					severity: 'success',
					summary: 'Success',
					detail: `App ${enabled ? 'enabled' : 'disabled'} successfully`,
					life: 3000,
				});
			},
			error: (error) => {
				console.error('Error toggling app:', error);

				// Revert optimistic update
				this.localOverrides.update((map) => {
					const next = new Map(map);
					next.delete(appKey);
					return next;
				});

				this.savingKeys.update((set) => {
					const next = new Set(set);
					next.delete(appKey);
					return next;
				});

				this.messageService.add({
					severity: 'error',
					summary: 'Error',
					detail: 'Failed to update app status',
					life: 3000,
				});
			},
		});
	}
}
