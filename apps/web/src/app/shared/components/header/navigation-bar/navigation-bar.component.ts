import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { ActiveRouteState } from '@datorama/akita-ng-router-store';
import { Observable } from 'rxjs';
import { Router } from '@angular/router';

import { GlobalSettings } from '../../../../state/global/global.model';
import { GlobalQuery } from '../../../../state/global/global.query';
import { environment } from '../../../../../environments/environment';
import { SessionQuery } from '../../../../state/session/session.query';
import { SessionService } from '../../../../state/session/session.service';
import type { PublicUser } from '../../../../../../../api/src/user/user.entity';

/**
 * Navigation Bar Component
 * This component handles the navigation of the header.
 */
@Component({
	selector: 'app-navigation-bar',
	standalone: false,
	templateUrl: './navigation-bar.component.html',
	styleUrls: ['./navigation-bar.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavigationBarComponent {
	@Input() activeRouteState: ActiveRouteState | null = null;

	public settings$: Observable<GlobalSettings | undefined>;
	public user$: Observable<PublicUser | undefined>;
	public production = environment.production;

	constructor(
		private readonly globalQuery: GlobalQuery,
		private readonly sessionQuery: SessionQuery,
		private readonly sessionService: SessionService,
		private readonly router: Router,
	) {
		this.settings$ = this.globalQuery.select('settings');
		this.user$ = this.sessionQuery.select('user');
	}

	logout(): void {
		this.sessionService.logout();
		this.router.navigate(['/login']);
	}
}
