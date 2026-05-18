import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { DEFAULT_SETTINGS } from '../../services/text-counter-settings.util';

import { TextCounterTextModeComponent } from './text-counter-text-mode.component';

const STORAGE_KEY = 'text-counter:settings:v1';

function makeFixture(): ComponentFixture<TextCounterTextModeComponent> {
	TestBed.configureTestingModule({
		imports: [TextCounterTextModeComponent],
		providers: [provideNoopAnimations()],
	});
	const fixture = TestBed.createComponent(TextCounterTextModeComponent);
	fixture.detectChanges();
	return fixture;
}

describe('TextCounterTextModeComponent', () => {
	beforeEach(() => {
		localStorage.removeItem(STORAGE_KEY);
	});

	afterEach(() => {
		localStorage.removeItem(STORAGE_KEY);
	});

	// -------------------------------------------------------------------
	// Counting (delegates to computeStats — these assert wiring, not math)
	// -------------------------------------------------------------------

	it('starts with empty text and zero stats', () => {
		const fixture = makeFixture();
		const c = fixture.componentInstance;

		expect(c.text()).toBe('');
		expect(c.stats().characters).toBe(0);
		expect(c.stats().words).toBe(0);
		expect(c.stats().lines).toBe(0);
	});

	it('updates stats when text changes', () => {
		const fixture = makeFixture();
		const c = fixture.componentInstance;

		c.onTextChange('hello world');

		expect(c.text()).toBe('hello world');
		expect(c.stats().characters).toBe(11);
		expect(c.stats().words).toBe(2);
		expect(c.stats().lines).toBe(1);
	});

	it('coerces null / undefined text to empty string', () => {
		const fixture = makeFixture();
		const c = fixture.componentInstance;

		c.onTextChange('seed');
		expect(c.text()).toBe('seed');

		c.onTextChange(null);
		expect(c.text()).toBe('');

		c.onTextChange(undefined);
		expect(c.text()).toBe('');
	});

	// -------------------------------------------------------------------
	// Settings persistence (localStorage key text-counter:settings:v1)
	// -------------------------------------------------------------------

	it('persists settings changes to localStorage under text-counter:settings:v1', () => {
		const fixture = makeFixture();
		const c = fixture.componentInstance;

		c.updateSetting('countWhitespaceAsCharacter', false);

		const raw = localStorage.getItem(STORAGE_KEY);
		expect(raw).not.toBeNull();
		const parsed = JSON.parse(raw!);
		expect(parsed.version).toBe(1);
		expect(parsed.settings.countWhitespaceAsCharacter).toBe(false);
	});

	it('persists target sub-object changes through updateTarget', () => {
		const fixture = makeFixture();
		const c = fixture.componentInstance;

		c.updateTarget('enabled', true);
		c.updateTarget('value', 99);
		c.updateTarget('unit', 'words');

		const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
		expect(parsed.settings.target.enabled).toBe(true);
		expect(parsed.settings.target.value).toBe(99);
		expect(parsed.settings.target.unit).toBe('words');
	});

	it('loads previously persisted settings on init (and does not load any text)', () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				version: 1,
				settings: {
					...DEFAULT_SETTINGS,
					target: { ...DEFAULT_SETTINGS.target },
					countWhitespaceAsCharacter: false,
					readingWpm: 320,
				},
			}),
		);

		const fixture = makeFixture();
		const c = fixture.componentInstance;

		expect(c.settings().countWhitespaceAsCharacter).toBe(false);
		expect(c.settings().readingWpm).toBe(320);
		// R7: no text is ever loaded from storage.
		expect(c.text()).toBe('');
	});

	// -------------------------------------------------------------------
	// Target indicator
	// -------------------------------------------------------------------

	it('returns null target summary when target is disabled', () => {
		const fixture = makeFixture();
		const c = fixture.componentInstance;

		c.onTextChange('hello');
		expect(c.targetSummary()).toBeNull();
	});

	it('reports target progress when target is enabled', () => {
		const fixture = makeFixture();
		const c = fixture.componentInstance;

		c.updateTarget('enabled', true);
		c.updateTarget('unit', 'characters');
		c.updateTarget('value', 10);
		c.onTextChange('hello world!');

		const t = c.targetSummary();
		expect(t).not.toBeNull();
		expect(t!.unit).toBe('characters');
		expect(t!.value).toBe(10);
		expect(t!.current).toBe(12);
		expect(t!.over).toBe(true);
	});

	it('isOverForUnit only reports over for the active target unit', () => {
		const fixture = makeFixture();
		const c = fixture.componentInstance;

		c.updateTarget('enabled', true);
		c.updateTarget('unit', 'words');
		c.updateTarget('value', 1);
		c.onTextChange('one two three');

		expect(c.isOverForUnit('words')).toBe(true);
		expect(c.isOverForUnit('characters')).toBe(false);
	});

	// -------------------------------------------------------------------
	// Reset
	// -------------------------------------------------------------------

	it('clears persisted settings and returns to defaults on reset', () => {
		const fixture = makeFixture();
		const c = fixture.componentInstance;

		c.updateSetting('countWhitespaceAsCharacter', false);
		c.updateSetting('readingWpm', 999);
		expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

		c.onReset();

		expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
		expect(c.settings().countWhitespaceAsCharacter).toBe(
			DEFAULT_SETTINGS.countWhitespaceAsCharacter,
		);
		expect(c.settings().readingWpm).toBe(DEFAULT_SETTINGS.readingWpm);
	});
});
