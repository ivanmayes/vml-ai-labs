import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import {
	ActiveRouteState,
	RouterQuery,
	RouterState,
} from '@datorama/akita-ng-router-store';
import { map } from 'rxjs/operators';

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
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, AccountBarComponent, NavigationBarComponent],
})
export class HeaderComponent {
	// Signal selectors
	headerSettings = this.globalQuery.header;
	routerActiveState = toSignal(
		this.routerQuery
			.select()
			.pipe(
				map(
					(state: RouterState) =>
						state.state as ActiveRouteState | null,
				),
			),
	);

	constructor(
		private readonly routerQuery: RouterQuery,
		private readonly globalQuery: GlobalQuery,
	) {}
}
