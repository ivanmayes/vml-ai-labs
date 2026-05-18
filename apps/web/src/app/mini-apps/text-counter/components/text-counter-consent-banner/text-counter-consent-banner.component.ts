import {
	ChangeDetectionStrategy,
	Component,
	output,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { PrimeNgModule } from '../../../../shared/primeng.module';

/**
 * One-time AI-vision consent banner (M11).
 *
 * Shown the first time a user uploads an image in the text-counter
 * image modes. The banner is self-contained — the parent renders it
 * conditionally (after at least one upload) and the banner decides
 * whether to display based on the `text-counter:ai-consent:v1`
 * localStorage flag.
 *
 * The banner emits `accepted` after the user clicks Got it. Parents
 * use this to drain any queued first-upload extractions that were
 * deferred pending consent (see image-general / image-template).
 *
 * The flag is intentionally per-user-device (not server-side): consent
 * here is to set expectations, not a legal contract — uploaded image
 * buffers are dropped immediately after extraction per R7.
 */
export const CONSENT_STORAGE_KEY = 'text-counter:ai-consent:v1';
const ACCEPTED_VALUE = 'accepted';

/**
 * Synchronous read of the AI-vision consent flag. Parents call this
 * BEFORE firing the first extraction so the first AI POST is gated on
 * an explicit accept rather than disclosed post-hoc.
 */
export function hasAIConsent(): boolean {
	if (typeof localStorage === 'undefined') return false;
	try {
		return localStorage.getItem(CONSENT_STORAGE_KEY) === ACCEPTED_VALUE;
	} catch {
		return false;
	}
}

function writeAccepted(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(CONSENT_STORAGE_KEY, ACCEPTED_VALUE);
	} catch {
		/* quota / private mode — banner just re-appears next visit */
	}
}

@Component({
	selector: 'app-text-counter-consent-banner',
	standalone: true,
	templateUrl: './text-counter-consent-banner.component.html',
	styleUrls: ['./text-counter-consent-banner.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, PrimeNgModule],
})
export class TextCounterConsentBannerComponent {
	/**
	 * Internal visibility, gated on the localStorage flag.
	 *
	 * NOTE: the parent (image-general / image-template) also gates the
	 * banner on "user has uploaded at least one image" so it never
	 * surfaces on cold page load — see R20 / M11 in the plan.
	 */
	readonly visible = signal<boolean>(!hasAIConsent());

	/**
	 * Emits when the user accepts the banner. Parents subscribe to
	 * drain any extractions that were queued pending consent.
	 */
	readonly accepted = output<void>();

	onAccept(): void {
		writeAccepted();
		this.visible.set(false);
		this.accepted.emit();
	}
}
