import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OktaAuth } from '@okta/okta-auth-js';
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import { GlobalSettings } from '../../state/global/global.model';
import { GlobalQuery } from '../../state/global/global.query';
import { GlobalService } from '../../state/global/global.service';
import { VerifyResponse } from '../../state/session/session.model';
import { SessionQuery } from '../../state/session/session.query';
import { SessionService } from '../../state/session/session.service';
import { fade } from '../../_core/utils/animations.utils';
import { environment } from '../../../environments/environment';

/**
 * Login Page
 * This page houses the different possible authentication strategies that
 * a user can use to login to the system.  Any authenticated page or api call with an invalid token
 * redirects the user to this page.  Depending on the user's email, different modules surface to
 * complete the authentication
 */
@Component({
	selector: 'app-login',
	templateUrl: './login.page.html',
	styleUrls: ['./login.page.scss'],
	animations: [fade('fade', 400, '-50%')]
})
export class LoginComponent implements OnInit, OnDestroy {
	public siteSettings$: Observable<GlobalSettings>;
	public email: string;
	public emailError: any;
	public settingsError: string;
	public loading$: Observable<boolean>;
	public state: 'enter-email' | 'basic' | 'okta' = 'enter-email';
	public authConfig: VerifyResponse;
	public exclusiveServer = environment.exclusive;

	constructor(
		private readonly globalQuery: GlobalQuery,
		private readonly globalService: GlobalService,
		private readonly sessionQuery: SessionQuery,
		private readonly sessionService: SessionService,
		private readonly router: Router,
		private readonly activatedRoute: ActivatedRoute
	) {
		this.siteSettings$ = this.globalQuery.select('settings');
		this.loading$ = this.sessionQuery.selectLoading();
	}

	async ngOnInit() {
		// console.log('params', this.activatedRoute.snapshot.queryParams.code);
		// if (this.activatedRoute.snapshot.queryParams.code) {
		// 	console.log('Got dat code', this.activatedRoute.snapshot.queryParams.code);
		// 	console.log('Okta code?', this.oktaAuthService.getAccessToken());
		// }

		// setInterval(() => console.log('Okta code?', this.oktaAuthService.getAccessToken()), 1000 );

		// Hide our main header
		// Hack: This weird timeout is to avoid expression changed error
		setTimeout(() => this.globalService.hideHeader(), 10);

		// Get our org settings
		this.globalService.getPublic().subscribe(
			settings => {
				console.log('Loaded Global Public Settings', settings);
				this.globalService.setTitle('Login');
			},
			err => {
				this.settingsError = err.message;
				console.log('Settings Error', err);
			}
		);

		let snapshot = this.activatedRoute.snapshot;

		// Look to see if we got here from an Okta call back.  If so
		// complete the okta login flow.
		if (snapshot.data.oktaCallback) {
			const tokens = await this.getOktaCallbackTokens();
			if (!tokens) {
				this.router.navigate(['/login']);
			}
		} else if (snapshot.data.samlCallback) {
			let orgId = snapshot.params.orgId;
			let authChallenge = decodeURIComponent(snapshot.params.authChallenge);
			this.sessionService.samlSignIn(orgId, authChallenge)
				.subscribe(
					response => {
						console.log(response);
						this.router.navigate([this.sessionQuery.getValue().initialUrl || 'home']);
					},
					err => this.handleError(err?.error?.statusCode)
			);
		}
	}

	ngOnDestroy() {
		this.globalService.showHeader();
	}

	/**
	 * Fires when the user submits their email address to the API.
	 * Depending on what we get back, we show the right auth strategy to finish the login.
	 */
	public submit() {
		this.emailError = undefined;

		// Request a code from the API
		this.sessionService.requestCode(this.email?.toLowerCase()).subscribe(
			response => {
				this.authConfig = response;

				if (response?.data?.strategy === 'okta') {
					// Redirect to the okta login site
					this.oktaLoginRedirect(this.authConfig);
				} else if (response?.data?.strategy === 'saml2.0') {
					window.location.href = response?.data?.authenticationUrl;
				} else {
					this.state = response?.data?.strategy as any;
				}
			},
			err => this.handleError(err?.error?.statusCode)
		);
	}

	/**
	 * Fires once any auth strategy component has confirmed that the user
	 * is logged in.  Redirects to home.
	 * TODO: Redirect to the previous path that the user was trying to visit
	 */
	loggedIn() {
		console.log('Logged in, go get real settings');
		this.globalService
			.get()
			.pipe(take(1))
			.subscribe(() => {
				this.router.navigate([this.sessionQuery.getValue().initialUrl || 'home']);
			});
	}

	/**
	 * Kick off the okta redirect login flow.
	 * @param authConfig
	 */
	oktaLoginRedirect(authConfig: VerifyResponse) {
		// HACK: Temp Hack for KCC, we missed a number when setting up their orgId
		let orgId = environment.organizationId;
		if (orgId === '374cf1cf-7a9a-41b6-a5ea-cb160582e8c5') {
			orgId += '3';
		}

		const oktaAuth = new OktaAuth({
			clientId: authConfig?.data?.clientId,
			issuer: authConfig?.data?.issuer,
			redirectUri: `${window.location.origin}/sso/okta/${orgId}/login`,
			pkce: true
		});

		// Launches the login redirect.
		oktaAuth.token.getWithRedirect({
			scopes: ['openid', 'email', 'profile']
		});
	}

	/**
	 * Retrieve the call back tokens fro Okta and save them to our API.
	 */
	async getOktaCallbackTokens() {
		try {
			const oktaAuth = new OktaAuth({
				clientId: this.sessionQuery.getValue().clientId,
				issuer: this.sessionQuery.getValue().issuer,
				redirectUri: `${window.location.origin}/sso/okta/${environment.organizationId}/login`,
				pkce: true
			});

			const tokenContainer = await oktaAuth.token.parseFromUrl();

			// Send to API to save
			this.sessionService
				.oktaSignIn(this.sessionQuery.getValue().user?.email, tokenContainer.tokens.accessToken, tokenContainer.tokens.idToken)
				.subscribe(resp => {
					this.loggedIn();
				});

			return tokenContainer.tokens;
		} catch (e) {
			// Look for an error description in the query params
			const errorMessage =
				this.activatedRoute.snapshot.queryParams?.error_description ||
				this.activatedRoute.snapshot.queryParams?.error ||
				'Could not get tokens from Okta, please check with IT on your access settings.';

			this.globalService.triggerErrorMessage(undefined, `Okta Error: ${errorMessage}`);

			return undefined;
		}
	}

	public async changeOrg() {
		this.sessionService.logout();
		window.location.reload();
	}

	/**
	 * Default Error Handler
	 * @param err
	 */
	public async handleError(err: string) {
		this.emailError = err;
		this.sessionService.setLoading(false);
		setTimeout(() => (this.emailError = undefined), 4000);
	}
}
