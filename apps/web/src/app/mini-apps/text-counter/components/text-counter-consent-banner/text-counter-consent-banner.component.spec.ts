import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import {
	CONSENT_STORAGE_KEY,
	TextCounterConsentBannerComponent,
} from './text-counter-consent-banner.component';

function build(): ComponentFixture<TextCounterConsentBannerComponent> {
	TestBed.configureTestingModule({
		imports: [TextCounterConsentBannerComponent],
		providers: [provideNoopAnimations()],
	});
	const fixture = TestBed.createComponent(TextCounterConsentBannerComponent);
	fixture.detectChanges();
	return fixture;
}

describe('TextCounterConsentBannerComponent', () => {
	beforeEach(() => {
		localStorage.removeItem(CONSENT_STORAGE_KEY);
	});

	afterEach(() => {
		localStorage.removeItem(CONSENT_STORAGE_KEY);
	});

	it('is visible by default when no consent flag is stored', () => {
		const fixture = build();
		expect(fixture.componentInstance.visible()).toBe(true);
	});

	it('is hidden on mount when consent has already been accepted', () => {
		localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted');
		const fixture = build();
		expect(fixture.componentInstance.visible()).toBe(false);
	});

	it('writes the accepted flag and hides on Got It', () => {
		const fixture = build();
		fixture.componentInstance.onAccept();

		expect(fixture.componentInstance.visible()).toBe(false);
		expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('accepted');
	});

	it('renders the banner element while visible and removes it after accept', () => {
		const fixture = build();
		expect(
			fixture.nativeElement.querySelector('.consent-banner'),
		).not.toBeNull();

		fixture.componentInstance.onAccept();
		fixture.detectChanges();

		expect(
			fixture.nativeElement.querySelector('.consent-banner'),
		).toBeNull();
	});

	it('treats any non-"accepted" stored value as not-yet-accepted', () => {
		localStorage.setItem(CONSENT_STORAGE_KEY, 'something-else');
		const fixture = build();
		expect(fixture.componentInstance.visible()).toBe(true);
	});
});
