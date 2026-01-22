import { Component } from '@angular/core';
import {
	ActiveRouteState,
	RouterQuery,
	RouterState,
} from '@datorama/akita-ng-router-store';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { HeaderSettings } from '../../../state/global/global.model';
import { GlobalQuery } from '../../../state/global/global.query';

/**
 * Header Component
 * This component handles the view for the header bar for the site, including the navigation and user profile.
 */
@Component({
	selector: 'app-header',
	templateUrl: './header.component.html',
	styleUrls: ['./header.component.scss'],
})
export class HeaderComponent {
	public routerActiveState$: Observable<ActiveRouteState>;

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
