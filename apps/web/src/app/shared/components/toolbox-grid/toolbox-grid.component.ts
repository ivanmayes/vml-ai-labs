import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	computed,
	input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { PrimeNgModule } from '../../primeng.module';
import {
	MiniAppManifestService,
	MiniAppManifestEntry,
} from '../../services/mini-app-manifest.service';
import { OrganizationAppService } from '../../services/organization-app.service';

@Component({
	selector: 'app-toolbox-grid',
	templateUrl: './toolbox-grid.component.html',
	styleUrls: ['./toolbox-grid.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
})
export class ToolboxGridComponent implements OnInit {
	/** Empty for home page, '/projects/:id' for project context */
	readonly baseRoute = input<string>('');

	readonly enabledApps = computed<MiniAppManifestEntry[]>(() => {
		const allApps = this.manifestService.apps();
		const orgApps = this.orgAppService.enabledApps();

		if (!allApps.length) return [];

		if (orgApps === undefined) {
			return allApps.filter((app) => app.defaultEnabled);
		}

		return allApps.filter((app) =>
			orgApps.some((oa) => oa.appKey === app.key && oa.enabled),
		);
	});

	constructor(
		private readonly router: Router,
		private readonly manifestService: MiniAppManifestService,
		private readonly orgAppService: OrganizationAppService,
	) {}

	ngOnInit(): void {
		this.manifestService.loadManifest();
		this.orgAppService.loadEnabledApps();
	}

	navigateToApp(app: MiniAppManifestEntry, event?: Event): void {
		event?.stopPropagation();
		const base = this.baseRoute().replace(/\/+$/, '');
		const path = base ? `${base}/apps/${app.key}` : `/apps/${app.key}`;
		this.router.navigate([path]);
	}
}
