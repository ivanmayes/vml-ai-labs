import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { TextCounterHomeComponent } from './text-counter-home.component';

const STORAGE_KEY = 'text-counter:settings:v1';

describe('TextCounterHomeComponent (tab shell)', () => {
	beforeEach(() => {
		localStorage.removeItem(STORAGE_KEY);
	});

	afterEach(() => {
		localStorage.removeItem(STORAGE_KEY);
	});

	function build() {
		TestBed.configureTestingModule({
			imports: [TextCounterHomeComponent],
			providers: [provideNoopAnimations()],
		});
		const fixture = TestBed.createComponent(TextCounterHomeComponent);
		fixture.detectChanges();
		return fixture;
	}

	it('defaults the active tab to "image-template"', () => {
		const fixture = build();
		expect(fixture.componentInstance.activeTab()).toBe('image-template');
	});

	it('renders all three tab triggers in lead-with-template order', () => {
		const fixture = build();
		const tabs = fixture.nativeElement.querySelectorAll('p-tab');
		// p-tab renders one element per tab trigger.
		expect(tabs.length).toBe(3);

		const labels = Array.from(tabs).map(
			(el) => (el as HTMLElement).textContent?.trim() ?? '',
		);
		expect(labels[0]).toContain('Image + template');
		expect(labels[1]).toContain('Image (general)');
		expect(labels[2]).toContain('Text');
	});

	it('mounts the image-template child for the default tab', () => {
		const fixture = build();
		// The image-template orchestrator is mounted in the default tabpanel.
		const child = fixture.nativeElement.querySelector(
			'app-text-counter-image-template',
		);
		expect(child).not.toBeNull();
	});

	it('updates activeTab signal when set programmatically', () => {
		const fixture = build();
		fixture.componentInstance.activeTab.set('image-general');
		fixture.detectChanges();
		expect(fixture.componentInstance.activeTab()).toBe('image-general');
	});
});
