import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AccessToken } from '@okta/okta-auth-js';
import OktaSignIn from '@okta/okta-signin-widget';
import { VerifyResponse } from '../../../state/session/session.model';
import { SessionService } from '../../../state/session/session.service';
import { environment } from '../../../../environments/environment';

@Component({
	selector: 'app-auth-okta',
	templateUrl: './okta.component.html',
	styleUrls: ['./okta.component.scss']
})
export class OktaAuthComponent implements OnInit {
	@Input() email: string;
	@Input() authConfig: VerifyResponse;
	@Output() loggedIn: EventEmitter<boolean> = new EventEmitter();

	public widget;
	public error: string;

	constructor(private readonly sessionService: SessionService) {}

	ngOnInit(): void {
		let orgId = environment.organizationId;

		console.log('Setting up Okta login', this.authConfig, `${window.location.origin}/sso/okta/${orgId}/login`);

		this.widget = new OktaSignIn({
			el: '#okta-signin-container',
			baseUrl: this.authConfig?.data?.issuer,
			username: this.email,
			authParams: {
				pkce: true
			},
			clientId: this.authConfig?.data?.clientId,
			redirectUri: `${window.location.origin}/sso/okta/${orgId}/login`
		});

		this.widget
			.showSignInToGetTokens()
			.then((tokens: { accessToken: string; idToken: string }) => {
				console.log('TOKENS!', tokens);
				this.sessionService.oktaSignIn(this.email, tokens.accessToken as any, tokens.idToken as any).subscribe(resp => {
					this.loggedIn.emit(true);
				});
			})
			.catch(err => {
				this.error = err.message;
			});
	}
}
