import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { PrimeNgModule } from '../../shared/primeng.module';
import {
	MiniAppManifestService,
	MiniAppManifestEntry,
} from '../../shared/services/mini-app-manifest.service';
import { OrganizationAppService } from '../../shared/services/organization-app.service';

@Component({
	selector: 'app-dashboard',
	templateUrl: './dashboard.component.html',
	styleUrls: ['./dashboard.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
})
export class DashboardComponent implements OnInit {
	/**
	 * Computed list of apps that are enabled for the current organization.
	 * Combines the manifest (all known apps) with the org-level enabled list.
	 */
	readonly enabledApps = computed<MiniAppManifestEntry[]>(() => {
		const allApps = this.manifestService.apps();
		const orgApps = this.orgAppService.enabledApps();

		if (!allApps.length) return [];

		// If org apps haven't loaded yet, show apps with defaultEnabled
		if (orgApps === undefined) {
			return allApps.filter((app) => app.defaultEnabled);
		}

		return allApps.filter((app) =>
			orgApps.some((oa) => oa.appKey === app.key && oa.enabled),
		);
	});

	constructor(
		private readonly manifestService: MiniAppManifestService,
		private readonly orgAppService: OrganizationAppService,
		private readonly router: Router,
	) {}

	ngOnInit(): void {
		this.manifestService.loadManifest();
		this.orgAppService.loadEnabledApps();
	}

	navigateToApp(app: MiniAppManifestEntry): void {
		this.router.navigate([app.route]);
	}
}
