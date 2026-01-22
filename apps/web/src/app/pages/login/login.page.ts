import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
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
 * Modern, accessible login experience with two-step verification
 *
 * UX Flow:
 * 1. User enters email address
 * 2. System determines auth strategy (basic OTP, Okta SSO, or SAML)
 * 3. For basic auth: User enters 6-digit OTP code
 * 4. For SSO: User is redirected to SSO provider
 *
 * Features:
 * - Reactive forms with validation
 * - PrimeNG InputOtp for optimal code entry
 * - Auto-submit on code completion
 * - Resend code functionality
 * - Comprehensive error handling
 * - ARIA accessibility labels
 */
@Component({
	standalone: false,
    selector: 'app-login',
    templateUrl: './login.page.html',
    styleUrls: ['./login.page.scss'],
    animations: [fade('fade', 400, '-50%')],
    
})
export class LoginComponent implements OnInit, OnDestroy {
	// Observables
	public siteSettings$: Observable<GlobalSettings>;
	public loading$: Observable<boolean>;

	// Forms
	public emailForm: FormGroup;
	public otpForm: FormGroup;

	// State management
	public state: 'enter-email' | 'basic' | 'okta' = 'enter-email';
	public email: string;
	public authConfig: VerifyResponse;

	// Error handling
	public emailError: any;
	public otpError = false;
	public settingsError: string;
	public resendSuccess = false;
	public isSubmitting = false;

	// Configuration
	public exclusiveServer = environment.exclusive;

	constructor(
		private readonly formBuilder: FormBuilder,
		private readonly globalQuery: GlobalQuery,
		private readonly globalService: GlobalService,
		private readonly sessionQuery: SessionQuery,
		private readonly sessionService: SessionService,
		private readonly router: Router,
		private readonly activatedRoute: ActivatedRoute
	) {
		this.siteSettings$ = this.globalQuery.select('settings');
		this.loading$ = this.sessionQuery.selectLoading();

		// Initialize email form with validation
		this.emailForm = this.formBuilder.group({
			email: ['', [Validators.required, Validators.email]]
		});

		// Initialize OTP form
		// Note: InputOtp component expects a string of digits
		this.otpForm = this.formBuilder.group({
			code: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
		});

		// Subscribe to OTP form changes for auto-submit
		this.otpForm.get('code')?.valueChanges.subscribe(value => {
			// Auto-submit when 6 digits are entered
			if (value && value.length === 6) {
				this.activateCode();
			}
		});
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

		const snapshot = this.activatedRoute.snapshot;

		// Look to see if we got here from an Okta call back.  If so
		// complete the okta login flow.
		if (snapshot.data.oktaCallback) {
			const tokens = await this.getOktaCallbackTokens();
			if (!tokens) {
				this.router.navigate(['/login']);
			}
		} else if (snapshot.data.samlCallback) {
			const orgId = snapshot.params.orgId;
			const authChallenge = decodeURIComponent(snapshot.params.authChallenge);
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
	 * Handles email form submission
	 * UX: Validates email and requests verification code from API
	 * Routes to appropriate auth strategy based on organization configuration
	 */
	public submit() {
		// Reset error state
		this.emailError = undefined;

		// Prevent submission if form is invalid
		if (this.emailForm.invalid) {
			this.emailForm.markAllAsTouched();
			return;
		}

		// Get email value from form
		this.email = this.emailForm.get('email')?.value?.toLowerCase();

		// Request verification code or SSO redirect from API
		this.sessionService.requestCode(this.email).subscribe(
			response => {
				this.authConfig = response;

				// Route to appropriate auth strategy
				if (response?.data?.strategy === 'okta') {
					// Redirect to Okta SSO login
					this.oktaLoginRedirect(this.authConfig);
				} else if (response?.data?.strategy === 'saml2.0') {
					// Redirect to SAML SSO provider
					window.location.href = response?.data?.authenticationUrl;
				} else {
					// Show basic auth OTP verification
					this.state = response?.data?.strategy as any;
					// Reset OTP form for new code entry
					this.otpForm.reset();
					this.otpError = false;
				}
			},
			err => this.handleError(err?.error?.statusCode)
		);
	}

	/**
	 * Handles OTP code verification
	 * UX: Validates 6-digit code and completes authentication
	 * Auto-called when user enters 6th digit for seamless experience
	 */
	public activateCode() {
		// Reset error state
		this.otpError = false;

		// Prevent submission if form is invalid or already loading
		if (this.otpForm.invalid || this.isSubmitting) {
			return;
		}

		this.isSubmitting = true;

		// Get OTP code from form
		const code = this.otpForm.get('code')?.value;

		// Submit code to API for verification
		this.sessionService.activateEmail(this.email, code).subscribe(
			() => {
				// Success - proceed to logged in state
				this.isSubmitting = false;
				this.loggedIn();
			},
			err => {
				// Show error and allow retry
				this.isSubmitting = false;
				this.otpError = true;
				this.sessionService.setLoading(false);
				// Clear error after 4 seconds for cleaner UX
				setTimeout(() => (this.otpError = false), 4000);
				// Reset form to allow new code entry
				this.otpForm.patchValue({ code: '' });
			}
		);
	}

	/**
	 * Resends verification code to user's email
	 * UX: Provides escape hatch if code doesn't arrive or expires
	 */
	public resendCode() {
		// Reset success state
		this.resendSuccess = false;
		this.otpError = false;

		// Request new code
		this.sessionService.requestCode(this.email).subscribe(
			response => {
				// Update auth config with new token (for dev mode display)
				this.authConfig = response;
				// Show success feedback
				this.resendSuccess = true;
				// Hide success message after 3 seconds
				setTimeout(() => (this.resendSuccess = false), 3000);
				// Reset OTP form for new code entry
				this.otpForm.reset();
			},
			err => {
				// Show error if resend fails
				this.otpError = true;
				setTimeout(() => (this.otpError = false), 4000);
			}
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
	 * Handles page reload for error recovery
	 * UX: Provides user action when system errors occur
	 */
	public reloadPage() {
		window.location.reload();
	}

	/**
	 * Handles email submission errors
	 * UX: Shows contextual error messages with auto-dismiss
	 * @param err Error code from API
	 */
	public async handleError(err: string) {
		this.emailError = err;
		this.sessionService.setLoading(false);
		// Auto-dismiss error after 4 seconds
		setTimeout(() => (this.emailError = undefined), 4000);
	}
}
