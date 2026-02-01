import { Injectable } from '@angular/core';
import {
	CanActivate,
	ActivatedRouteSnapshot,
	RouterStateSnapshot,
	Router,
} from '@angular/router';
import { Observable } from 'rxjs';
import { SessionQuery } from '../../state/session/session.query';

@Injectable({
	providedIn: 'root',
})
export class SpaceAdminGuard implements CanActivate {
	constructor(
		private sessionQuery: SessionQuery,
		private router: Router,
	) {}

	canActivate(
		_route: ActivatedRouteSnapshot,
		_state: RouterStateSnapshot,
	): Observable<boolean> | Promise<boolean> | boolean {
		const user = this.sessionQuery.getValue().user;

		if (!user) {
			this.router.navigate(['/login']);
			return false;
		}

		// Platform admins and super admins have access
		if (user.role === 'super-admin' || user.role === 'admin') {
			return true;
		}

		// TODO: Check if user is a space admin for the specific space
		// This would require calling the backend to check space user role
		// For now, we'll allow access and let the backend enforce the permission
		return true;
	}
}
