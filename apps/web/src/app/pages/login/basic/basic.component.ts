import {
	ChangeDetectionStrategy,
	Component,
	input,
	output,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { GlobalQuery } from '../../../state/global/global.query';
import { VerifyResponse } from '../../../state/session/session.model';
import { SessionQuery } from '../../../state/session/session.query';
import { SessionService } from '../../../state/session/session.service';
import { fade } from '../../../_core/utils/animations.utils';
import { PrimeNgModule } from '../../../shared/primeng.module';

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
	changeDetection: ChangeDetectionStrategy.OnPush,
	animations: [fade('fade', 400, '-50%')],
	imports: [CommonModule, FormsModule, PrimeNgModule],
})
export class BasicAuthComponent {
	// Input signals
	email = input.required<string>();
	authConfig = input.required<VerifyResponse>();

	// Output signal
	loggedIn = output<boolean>();

	// Local state signals
	key = signal('');
	resendComplete = signal(false);
	error = signal<string | null>(null);

	// Signal selectors
	siteSettings = this.globalQuery.settings;
	loading = this.sessionQuery.loading;

	constructor(
		private readonly globalQuery: GlobalQuery,
		private readonly sessionService: SessionService,
		private readonly sessionQuery: SessionQuery,
	) {}

	/**
	 * Send the activation code to the API to see if its correct for the previously entered email.
	 */
	public activate() {
		this.sessionService
			.activateEmail(this.email()?.toLowerCase(), this.key())
			.subscribe({
				next: () => {
					this.loggedIn.emit(true);
				},
				error: (err) => this.handleError(err?.error?.statusCode),
			});
	}

	/**
	 * Resend the activation code
	 */
	public resend() {
		this.resendComplete.set(false);
		this.sessionService
			.requestCode(this.email()?.toLowerCase())
			.subscribe(() => {
				this.error.set(null);
				setTimeout(() => this.resendComplete.set(true), 100);
				setTimeout(() => this.resendComplete.set(false), 3000);
			});
	}

	/**
	 * Default error handler
	 * @param err
	 */
	public async handleError(err: string) {
		this.error.set(err);
		this.sessionService.setLoading(false);
		setTimeout(() => this.error.set(null), 4000);
	}

	// Helper for two-way binding with signals
	updateKey(value: string) {
		this.key.set(value);
	}
}
