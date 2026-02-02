import { Injectable } from '@angular/core';
import { Query, toBoolean } from '@datorama/akita';

import { SessionStore, getSession } from './session.store';
import { SessionState } from './session.model';

@Injectable({
	providedIn: 'root',
})
export class SessionQuery extends Query<SessionState> {
	isLoggedIn$ = this.select('isLoggedIn');
	user$ = this.select((state) => state.user);

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
