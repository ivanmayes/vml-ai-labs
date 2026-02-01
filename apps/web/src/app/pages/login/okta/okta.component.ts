import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import OktaSignIn from '@okta/okta-signin-widget';
import { VerifyResponse } from '../../../state/session/session.model';
import { SessionService } from '../../../state/session/session.service';
import { environment } from '../../../../environments/environment';

@Component({
	standalone: false,
	selector: 'app-auth-okta',
	templateUrl: './okta.component.html',
	styleUrls: ['./okta.component.scss'],
})
export class OktaAuthComponent implements OnInit {
	@Input() email!: string;
	@Input() authConfig!: VerifyResponse;
	@Output() loggedIn = new EventEmitter<boolean>();

	public widget: OktaSignIn | undefined;
	public error!: string;

	constructor(private readonly sessionService: SessionService) {}

	ngOnInit(): void {
		const orgId = environment.organizationId;

		console.log(
			'Setting up Okta login',
			this.authConfig,
			`${window.location.origin}/sso/okta/${orgId}/login`,
		);

		this.widget = new OktaSignIn({
			el: '#okta-signin-container',
			baseUrl: this.authConfig?.data?.issuer,
			username: this.email,
			authParams: {
				pkce: true,
			},
			clientId: this.authConfig?.data?.clientId,
			redirectUri: `${window.location.origin}/sso/okta/${orgId}/login`,
		});

		this.widget
			.showSignInToGetTokens()
			.then((tokens: unknown) => {
				console.log('TOKENS!', tokens);
				const typedTokens = tokens as {
					accessToken: string;
					idToken: string;
				};
				this.sessionService
					.oktaSignIn(
						this.email,
						typedTokens.accessToken as any,
						typedTokens.idToken as any,
					)
					.subscribe((_resp) => {
						this.loggedIn.emit(true);
					});
			})
			.catch((err: Error) => {
				this.error = err.message;
			});
	}
}
