import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Observable } from 'rxjs';
import { GlobalSettings } from '../../../state/global/global.model';
import { GlobalQuery } from '../../../state/global/global.query';
import { VerifyResponse } from '../../../state/session/session.model';
import { SessionQuery } from '../../../state/session/session.query';
import { SessionService } from '../../../state/session/session.service';
import { fade } from '../../../_core/utils/animations.utils';

/**
 * Basic Auth Component
 * This component facilitates the basic auth strategy where a user receives an emailed code to
 * verify their email, then enters that code to confirm their login and receive an access token.
 * Ideally, only devs would use this and everyone else would be using SSO
 */
@Component({
	selector: 'app-auth-basic',
	templateUrl: './basic.component.html',
	styleUrls: ['./basic.component.scss'],
	animations: [fade('fade', 400, '-50%')],
})
export class BasicAuthComponent {
	@Input() email: string;
	@Input() authConfig: VerifyResponse;
	@Output() loggedIn = new EventEmitter<boolean>();

	public key: string;
	public resendComplete = false;
	public error: any;
	public siteSettings$: Observable<GlobalSettings>;
	public loading$: Observable<boolean>;

	constructor(
		private readonly globalQuery: GlobalQuery,
		private readonly sessionService: SessionService,
		private readonly sessionQuery: SessionQuery,
	) {
		this.siteSettings$ = this.globalQuery.select('settings');
		this.loading$ = this.sessionQuery.selectLoading();
	}

	/**
	 * Send the activation code to the API to see if its correct for the previously entered email.
	 */
	public activate() {
		this.sessionService
			.activateEmail(this.email?.toLowerCase(), this.key)
			.subscribe(
				() => {
					this.loggedIn.emit(true);
				},
				(err) => this.handleError(err?.error?.statusCode),
			);
	}

	/**
	 * Resend the activation code
	 */
	public resend() {
		this.resendComplete = false;
		this.sessionService
			.requestCode(this.email?.toLowerCase())
			.subscribe(() => {
				this.error = undefined;
				setTimeout(() => (this.resendComplete = true), 100);
				setTimeout(() => (this.resendComplete = false), 3000);
			});
	}

	/**
	 * Default error handler
	 * @param err
	 */
	public async handleError(err: string) {
		this.error = err;
		this.sessionService.setLoading(false);
		setTimeout(() => (this.error = undefined), 4000);
	}
}
