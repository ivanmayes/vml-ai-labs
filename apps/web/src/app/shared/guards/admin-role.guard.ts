import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { SessionQuery } from '../../state/session/session.query';
import { UserRole } from '../../../../../api/src/user/user-role.enum';

@Injectable({
	providedIn: 'root'
})
export class AdminRoleGuard implements CanActivate {
	constructor(
		private readonly sessionQuery: SessionQuery,
		private readonly router: Router
	) {}

	canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
		const user = this.sessionQuery.getValue().user;

		if (user && (user.role === UserRole.Admin || user.role === UserRole.SuperAdmin)) {
			return true;
		}

		// Redirect to home if not admin
		this.router.navigate(['/home']);
		return false;
	}
}
