import { Injectable } from '@angular/core';
import { Store, StoreConfig } from '@datorama/akita';
import type { Profile, PublicUser } from '../../../../../api/src/user/user.entity';
import { SessionState } from './session.model';
import { environment } from '../../../environments/environment';

export const SESSION_KEY = `${environment.organizationId}-Session`;
export const ORG_SETTINGS = `${environment.organizationId}-Settings`;

export function createInitialSessionState(): SessionState {
	return {
		token: null,
		clientId: null,
		issuer: null,
		user: {
			id: undefined,
			email: undefined,
			nameFirst: undefined,
			nameLast: undefined,
			role: undefined
		},
		...getSession(),
		isLoggedIn: false,
		ui: {
			emailInput: undefined
		},
		initialUrl: undefined
	};
}

export function getSession() {
	const session = localStorage.getItem(SESSION_KEY);
	return session ? JSON.parse(session) : {};
}

@Injectable({ providedIn: 'root' })
@StoreConfig({ name: 'session' })
export class SessionStore extends Store<SessionState> {
	constructor() {
		super(createInitialSessionState());
	}

	updateLoginDetails(session: Partial<SessionState>) {
		localStorage.setItem(SESSION_KEY, JSON.stringify(session));
		this.update(state => ({
			...state,
			...session
		}));
	}

	login(session: Partial<SessionState>) {
		localStorage.setItem(SESSION_KEY, JSON.stringify(session));
		this.update(state => ({
			...state,
			...session,
			isLoggedIn: true
		}));
	}

	logout() {
		localStorage.removeItem(SESSION_KEY);
		localStorage.removeItem(ORG_SETTINGS);
		this.update(createInitialSessionState());
	}

	/**
	 * Merge any user properties in with existing user
	 */
	updateUser(user: Partial<PublicUser>) {
		this.update(state => ({
			...state,
			user: {
				...state.user,
				...user
			}
		}));
	}
}
