import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
	ActiveRouteState,
	RouterQuery,
	RouterState,
} from '@datorama/akita-ng-router-store';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { HeaderSettings } from '../../../state/global/global.model';
import { GlobalQuery } from '../../../state/global/global.query';

import { AccountBarComponent } from './account-bar/account-bar.component';
import { NavigationBarComponent } from './navigation-bar/navigation-bar.component';

/**
 * Header Component
 * This component handles the view for the header bar for the site, including the navigation and user profile.
 */
@Component({
	selector: 'app-header',
	templateUrl: './header.component.html',
	styleUrls: ['./header.component.scss'],
	imports: [CommonModule, AccountBarComponent, NavigationBarComponent],
})
export class HeaderComponent {
	public routerActiveState$: Observable<ActiveRouteState | null>;

	public headerSettings$: Observable<HeaderSettings>;

	constructor(
		private readonly routerQuery: RouterQuery,
		private readonly globalQuery: GlobalQuery,
	) {
		this.routerActiveState$ = this.routerQuery
			.select()
			.pipe(map((state: RouterState) => state.state));
		this.headerSettings$ = this.globalQuery.select('header');
	}
}
