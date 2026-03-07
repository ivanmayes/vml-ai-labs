import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, switchMap, take } from 'rxjs';

import { OrganizationAppService } from '../services/organization-app.service';
import { SessionQuery } from '../../state/session/session.query';

export const appAccessGuard: CanActivateFn = (route) => {
	const orgAppService = inject(OrganizationAppService);
	const sessionQuery = inject(SessionQuery);
	const router = inject(Router);

	// Capture observable in injection context (toObservable requires it)
	const enabledApps$ = toObservable(orgAppService.enabledApps);

	const appKey = route.url[0]?.path;
	if (!appKey) {
		// Empty path means this is a sub-route of an already-authorized app
		return true;
	}

	const enabledApps = orgAppService.enabledApps();
	if (enabledApps !== undefined) {
		const isEnabled = enabledApps.some(
			(app) => app.appKey === appKey && app.enabled,
		);
		return isEnabled ? true : router.createUrlTree(['/home']);
	}

	// Wait for session to be valid before loading apps (avoids token rotation race)
	return sessionQuery.isLoggedIn$.pipe(
		filter((loggedIn) => loggedIn === true),
		take(1),
		switchMap(() => {
			orgAppService.loadEnabledApps();
			return enabledApps$.pipe(
				filter((apps) => apps !== undefined),
				take(1),
				map((apps) => {
					const isEnabled = apps!.some(
						(app) => app.appKey === appKey && app.enabled,
					);
					return isEnabled ? true : router.createUrlTree(['/home']);
				}),
			);
		}),
	);
};
