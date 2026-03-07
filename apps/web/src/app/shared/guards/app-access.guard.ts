import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { OrganizationAppService } from '../services/organization-app.service';

export const appAccessGuard: CanActivateFn = (route) => {
	const orgAppService = inject(OrganizationAppService);
	const router = inject(Router);

	const appKey = route.url[0]?.path;
	if (!appKey) {
		return router.createUrlTree(['/home']);
	}

	const enabledApps = orgAppService.enabledApps();
	if (enabledApps === undefined) {
		// Not loaded yet — allow through, service will load
		return true;
	}

	const isEnabled = enabledApps.some(
		(app) => app.appKey === appKey && app.enabled,
	);
	return isEnabled ? true : router.createUrlTree(['/home']);
};
