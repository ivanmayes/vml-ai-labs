import { ChangeDetectionStrategy, Component, HostBinding, Input, OnInit } from '@angular/core';
import { ActiveRouteState } from '@datorama/akita-ng-router-store';
import { GlobalSettings } from '../../../../state/global/global.model';
import { GlobalQuery } from '../../../../state/global/global.query';
import { environment } from '../../../../../environments/environment';
import { Observable } from 'rxjs';
import { SessionQuery } from '../../../../state/session/session.query';
import { SessionService } from '../../../../state/session/session.service';
import { Router } from '@angular/router';
import type { PublicUser } from '../../../../../../../api/src/user/user.entity';

/**
 * Navigation Bar Component
 * This component handles the navigation of the header.
 */
@Component({
	selector: 'app-navigation-bar',
	templateUrl: './navigation-bar.component.html',
	styleUrls: ['./navigation-bar.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavigationBarComponent implements OnInit {
	@Input() activeRouteState: ActiveRouteState;

	public settings$: Observable<GlobalSettings>;
	public user$: Observable<PublicUser>;
	public production = environment.production;

	constructor(
		private readonly globalQuery: GlobalQuery,
		private readonly sessionQuery: SessionQuery,
		private readonly sessionService: SessionService,
		private readonly router: Router
	) {
		this.settings$ = this.globalQuery.select('settings');
		this.user$ = this.sessionQuery.select('user');
	}

	ngOnInit(): void {
	}

	logout() {
		this.sessionService.logout();
		this.router.navigate(['/login']);
	}
}
