import { Injectable } from '@angular/core';
import { SessionStore } from './session.store';
import { catchError, map, tap } from 'rxjs/operators';
import { LoginResponse, VerifyResponse, WppOpenLoginResponse } from './session.model';
import { environment } from '../../../environments/environment';
import { HttpHeaders, HttpClient } from '@angular/common/http';
import { throwError } from 'rxjs';
import { AccessToken, IDToken } from '@okta/okta-auth-js';
import { Hierarchy } from '../../../../../api/src/_core/third-party/wpp-open/models';

/**
 * Session Service
 * This service is responsible for the session logic and API calls.
 */
@Injectable({
	providedIn: 'root'
})
export class SessionService {
	public defaultHeaders = new HttpHeaders({
		Accept: 'application/json'
	});

	constructor(private sessionStore: SessionStore, protected httpClient: HttpClient) {}

	public wppOpenLogin(
		token: string,
		organizationId: string,
		workspaceId?: string,
		scopeId?: string,
		projectRemoteId?: string,
		projectRemoteName?: string,
		hierarchy?: Hierarchy,
		tenantId?: string
	) {
		const headers = this.defaultHeaders;
		this.sessionStore.setLoading(true);

		return this.httpClient
			.post<WppOpenLoginResponse>(
				`${environment.apiUrl}/user/auth/wpp-open/sign-in`,
				{
					token,
					organizationId: organizationId,
					workspaceId,
					scopeId,
					projectRemoteId,
					projectRemoteName,
					hierarchy,
					tenantId
				},
				{
					headers
				}
			)
			.pipe(
				map(resp => {
					this.sessionStore.login({
						initialUrl: resp?.data?.redirect,
						token: resp?.token,
						user: resp?.profile
					});

					this.sessionStore.setLoading(false);

					return resp;
				}),
				catchError(err => {
					this.sessionStore.setLoading(false);
					throw err;
				})
			);
	}

	/**
	 * Verify a user's email on our system and then send the email a code
	 * to enter to verify that it is valid and they have access to it.
	 */
	public requestCode(email: string) {
		const headers = this.defaultHeaders;
		this.sessionStore.setLoading(true);

		return this.httpClient
			.post<VerifyResponse>(
				`${environment.apiUrl}/user/auth/request-sign-in`,
				{ email, organizationId: environment.organizationId },
				{ headers }
			)
			.pipe(
				tap(resp => {
					this.sessionStore.setLoading(false);
					this.sessionStore.updateLoginDetails({
						clientId: resp?.data?.clientId,
						issuer: resp?.data.issuer,
						user: {
							...this.sessionStore.getValue().user,
							email
						}
					});
				}),
				catchError(err => {
					console.log('Login Error', err);
					this.sessionStore.setLoading(false);
					this.sessionStore.setError(err);
					return throwError(err);
				})
			);
	}

	/**
	 * Send the code provided by the user to make sure its valid, then return an access token.
	 */
	public activateEmail(email: string, singlePass: string) {
		// http call to verify code
		const params = {
			singlePass,
			email,
			organizationId: environment.organizationId
		};
		const headers = this.defaultHeaders;
		this.sessionStore.setLoading(true);

		return this.httpClient.post<LoginResponse>(`${environment.apiUrl}/user/auth/basic/code-sign-in`, params, { headers }).pipe(
			tap(resp => {
				this.sessionStore.login({
					token: resp?.data?.token,
					user: resp?.data?.user
				});

				this.sessionStore.setLoading(false);
			})
		);
	}

	/**
	 * Attempt to sign in via okta based on the org settings.
	 */
	public oktaSignIn(email: string, accessToken: AccessToken, idToken: IDToken) {
		const headers = this.defaultHeaders;
		this.sessionStore.setLoading(true);

		return this.httpClient
			.post<LoginResponse>(
				`${environment.apiUrl}/user/auth/okta/sign-in`,
				{
					email,
					organizationId: environment.organizationId,
					accessToken,
					idToken
				},
				{ headers }
			)
			.pipe(
				tap(resp => {
					this.sessionStore.login({
						token: resp?.data?.token,
						user: resp?.data?.user
					});

					this.sessionStore.setLoading(false);
				})
			);
	}

	/**
	 * Attempt to sign in via SAML2.0, based on the org settings.
	 */
	public samlSignIn(organizationId: string, authChallenge: string) {
		const headers = this.defaultHeaders;
		this.sessionStore.setLoading(true);

		return this.httpClient
			.post<LoginResponse>(
				`${environment.apiUrl}/user/auth/saml/sign-in`,
				{
					organizationId,
					authChallenge
				},
				{
					headers
				}
			)
			.pipe(
				tap(resp => {
					this.sessionStore.login({
						token: resp?.data?.token,
						user: resp?.data?.user
					});
					this.sessionStore.setLoading(false);
				})
			);
	}

	/**
	 * Check a user's token for validity, return user profile.
	 */
	public getUserStatus(token: string) {
		console.log('Getting User Status');
		return this.httpClient.get<LoginResponse>(`${environment.apiUrl}/user/refresh`).pipe(
			tap((resp: LoginResponse) => {
				this.sessionStore.login({
					token: resp?.data?.token,
					user: resp?.data?.user
				});
			})
		);
	}

	/**
	 * Set the Akita loading state.
	 */
	public setLoading(state: boolean) {
		this.sessionStore.setLoading(state);
	}

	/**
	 * Set the url the user was attempting to go to before having to login.
	 */
	public setInitialUrl(url: string) {
		this.sessionStore.update({
			initialUrl: url
		});
	}

	/**
	 * Remove the users's access token.
	 */
	public logout() {
		this.sessionStore.logout();
	}
}
