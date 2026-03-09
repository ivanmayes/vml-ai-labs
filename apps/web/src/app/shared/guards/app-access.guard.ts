import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { filter, map, switchMap, take } from 'rxjs';

import {
	OrganizationApp,
	OrganizationAppService,
} from '../services/organization-app.service';
import { SessionQuery } from '../../state/session/session.query';

function checkAccess(
	apps: OrganizationApp[],
	appKey: string,
	router: Router,
): true | UrlTree {
	const isEnabled = apps.some((app) => app.appKey === appKey && app.enabled);
	return isEnabled ? true : router.createUrlTree(['/home']);
}

export const appAccessGuard: CanActivateFn = (route) => {
	const orgAppService = inject(OrganizationAppService);
	const sessionQuery = inject(SessionQuery);
	const router = inject(Router);

	const appKey = route.url[0]?.path;
	if (!appKey) {
		// Empty path means this is a sub-route of an already-authorized app
		return true;
	}

	// Fast path: apps already loaded — check synchronously
	const enabledApps = orgAppService.enabledApps();
	if (enabledApps !== undefined) {
		return checkAccess(enabledApps, appKey, router);
	}

	// Slow path: wait for session to be valid, then load apps from the API.
	// Uses the observable returned by loadEnabledApps() instead of
	// toObservable() to avoid leaking an effect on every guard invocation.
	return sessionQuery.isLoggedIn$.pipe(
		filter((loggedIn) => loggedIn === true),
		take(1),
		switchMap(() => orgAppService.loadEnabledApps()),
		take(1),
		map((apps) => checkAccess(apps, appKey, router)),
	);
};
