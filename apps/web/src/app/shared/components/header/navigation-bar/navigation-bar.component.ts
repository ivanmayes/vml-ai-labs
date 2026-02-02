import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActiveRouteState } from '@datorama/akita-ng-router-store';
import { Router, RouterModule } from '@angular/router';

import { GlobalQuery } from '../../../../state/global/global.query';
import { environment } from '../../../../../environments/environment';
import { SessionQuery } from '../../../../state/session/session.query';
import { SessionService } from '../../../../state/session/session.service';
import { PrimeNgModule } from '../../../primeng.module';

/**
 * Navigation Bar Component
 * This component handles the navigation of the header.
 */
@Component({
	selector: 'app-navigation-bar',
	templateUrl: './navigation-bar.component.html',
	styleUrls: ['./navigation-bar.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, RouterModule, PrimeNgModule],
})
export class NavigationBarComponent {
	// Input signal
	activeRouteState = input<ActiveRouteState | null>(null);

	// Signal selectors
	settings = this.globalQuery.settings;
	user = this.sessionQuery.user;

	public production = environment.production;

	constructor(
		private readonly globalQuery: GlobalQuery,
		private readonly sessionQuery: SessionQuery,
		private readonly sessionService: SessionService,
		private readonly router: Router,
	) {}

	logout(): void {
		this.sessionService.logout();
		this.router.navigate(['/login']);
	}
}
