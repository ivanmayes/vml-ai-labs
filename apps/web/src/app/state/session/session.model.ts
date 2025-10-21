import type { Profile, PublicUser } from '../../../../../api/src/user/user.entity';

export interface SessionState {
	token: string;
	clientId: string;
	issuer: string;
	user?: PublicUser;
	isLoggedIn: boolean;
	ui: {
		emailInput: string;
	};
	initialUrl: string; // The URL the user was at when they first opened the app
}

/**
 * The default envelope for most API calls
 */
export interface DefaultResponse<T> {
	message: string;
	data?: T;
	status: string;
}

/**
 * The response object to verify a user's email address.
 */
export interface VerifyResponse extends DefaultResponse<any> {
	data?: {
		strategy?: string;
		issuer?: string;
		clientId?: string;
		token?: string;
		authenticationUrl?: string;
	};
}

/**
 * The response object for trying to login with a token.
 */
export interface LoginResponse extends DefaultResponse<any> {
	data?: {
		token: string;
		user: PublicUser;
		redirect?: string;
	};
}


export interface WppOpenLoginResponse extends DefaultResponse<any> {
	status: string;
	token: string;
	profile: PublicUser;
	spaceId?: string;
}
