import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';

import { OrganizationAppService } from '../services/organization-app.service';

export const appAccessGuard: CanActivateFn = (route) => {
	const orgAppService = inject(OrganizationAppService);
	const router = inject(Router);

	const appKey = route.url[0]?.path;
	if (!appKey) {
		return router.createUrlTree(['/home']);
	}

	const enabledApps = orgAppService.enabledApps();
	if (enabledApps !== undefined) {
		const isEnabled = enabledApps.some(
			(app) => app.appKey === appKey && app.enabled,
		);
		return isEnabled ? true : router.createUrlTree(['/home']);
	}

	// Apps not loaded yet — wait for them before deciding
	return toObservable(orgAppService.enabledApps).pipe(
		filter((apps) => apps !== undefined),
		take(1),
		map((apps) => {
			const isEnabled = apps!.some(
				(app) => app.appKey === appKey && app.enabled,
			);
			return isEnabled ? true : router.createUrlTree(['/home']);
		}),
	);
};
