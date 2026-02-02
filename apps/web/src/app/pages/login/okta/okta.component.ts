import {
	ChangeDetectionStrategy,
	Component,
	input,
	output,
	signal,
	OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import OktaSignIn from '@okta/okta-signin-widget';

import { VerifyResponse } from '../../../state/session/session.model';
import { SessionService } from '../../../state/session/session.service';
import { environment } from '../../../../environments/environment';

@Component({
	selector: 'app-auth-okta',
	templateUrl: './okta.component.html',
	styleUrls: ['./okta.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule],
})
export class OktaAuthComponent implements OnInit {
	// Input signals
	email = input.required<string>();
	authConfig = input.required<VerifyResponse>();

	// Output signal
	loggedIn = output<boolean>();

	// Local state
	public widget: OktaSignIn | undefined;
	error = signal<string | null>(null);

	constructor(private readonly sessionService: SessionService) {}

	ngOnInit(): void {
		const orgId = environment.organizationId;

		this.widget = new OktaSignIn({
			el: '#okta-signin-container',
			baseUrl: this.authConfig()?.data?.issuer,
			username: this.email(),
			authParams: {
				pkce: true,
			},
			clientId: this.authConfig()?.data?.clientId,
			redirectUri: `${window.location.origin}/sso/okta/${orgId}/login`,
		});

		this.widget
			.showSignInToGetTokens()
			.then((tokens: unknown) => {
				const typedTokens = tokens as {
					accessToken: string;
					idToken: string;
				};
				this.sessionService
					.oktaSignIn(
						this.email(),
						typedTokens.accessToken as any,
						typedTokens.idToken as any,
					)
					.subscribe((_resp) => {
						this.loggedIn.emit(true);
					});
			})
			.catch((err: Error) => {
				this.error.set(err.message);
			});
	}
}
