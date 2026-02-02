import { Injectable, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Query, toBoolean } from '@datorama/akita';

import { UserRole } from '../../shared/models/user-role.enum';

import { SessionStore, getSession } from './session.store';
import { SessionState } from './session.model';

@Injectable({
	providedIn: 'root',
})
export class SessionQuery extends Query<SessionState> {
	// Observable selectors (keep for backward compatibility)
	isLoggedIn$ = this.select('isLoggedIn');
	user$ = this.select((state) => state.user);

	// Signal-based selectors for zoneless
	readonly user = toSignal(this.select('user'));
	readonly token = toSignal(this.select('token'));
	readonly isLoggedInSignal = toSignal(this.select('isLoggedIn'));
	readonly loading = toSignal(this.selectLoading());

	// Computed signals
	readonly isAdmin = computed(() => {
		const user = this.user();
		const role = user?.role;
		return role === UserRole.Admin || role === UserRole.SuperAdmin;
	});

	constructor(protected override store: SessionStore) {
		super(store);
	}

	isLoggedIn() {
		return toBoolean(this.getValue().isLoggedIn);
	}

	getEmailInput() {
		return this.getValue().ui.emailInput;
	}

	getUser() {
		return this.getValue().user;
	}

	getRole() {
		return this.getValue().user?.role;
	}

	getToken() {
		// Actually, we want to always get the token from localstorage
		// in case its changed in a new tab
		const session = getSession();
		return session?.token;
	}
}
