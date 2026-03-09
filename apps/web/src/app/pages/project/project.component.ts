import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	computed,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { PrimeNgModule } from '../../shared/primeng.module';
import {
	MiniAppManifestService,
	MiniAppManifestEntry,
} from '../../shared/services/mini-app-manifest.service';
import { OrganizationAppService } from '../../shared/services/organization-app.service';

@Component({
	selector: 'app-project',
	templateUrl: './project.component.html',
	styleUrls: ['./project.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
})
export class ProjectComponent implements OnInit {
	readonly spaceId = signal('');
	readonly projectId = signal('');

	/**
	 * Computed list of apps enabled for the current organization,
	 * filtered to those relevant in a project context.
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
		private readonly route: ActivatedRoute,
		private readonly router: Router,
		private readonly manifestService: MiniAppManifestService,
		private readonly orgAppService: OrganizationAppService,
	) {}

	ngOnInit(): void {
		this.manifestService.loadManifest();
		this.orgAppService.loadEnabledApps();

		this.route.params.subscribe((params) => {
			this.spaceId.set(params['spaceId'] || '');
			this.projectId.set(params['projectId'] || '');
		});
	}

	navigateToApp(app: MiniAppManifestEntry): void {
		this.router.navigate([app.route], {
			queryParams: {
				spaceId: this.spaceId(),
				projectId: this.projectId(),
			},
		});
	}
}
