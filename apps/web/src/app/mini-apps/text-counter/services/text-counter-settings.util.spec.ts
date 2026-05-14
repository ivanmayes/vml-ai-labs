import type { TextCounterSettings } from '../models/text-counter.types';

import {
	DEFAULT_SETTINGS,
	loadSettings,
	resetSettings,
	saveSettings,
} from './text-counter-settings.util';

const STORAGE_KEY = 'text-counter:settings:v1';

function customSettings(): TextCounterSettings {
	return {
		countWhitespaceAsCharacter: false,
		countLineBreaksAsCharacter: true,
		wordRule: 'alphanumeric',
		showSentences: false,
		showParagraphs: false,
		showReadingTime: false,
		showSpeakingTime: true,
		readingWpm: 300,
		speakingWpm: 150,
		target: { enabled: true, unit: 'words', value: 500 },
	};
}

describe('text-counter-settings.util', () => {
	beforeEach(() => {
		localStorage.removeItem(STORAGE_KEY);
	});

	describe('loadSettings', () => {
		it('returns defaults when localStorage is empty', () => {
			expect(loadSettings()).toEqual(
				DEFAULT_SETTINGS as TextCounterSettings,
			);
		});

		it('returns defaults when stored JSON is invalid', () => {
			localStorage.setItem(STORAGE_KEY, '{not valid json');
			expect(loadSettings()).toEqual(
				DEFAULT_SETTINGS as TextCounterSettings,
			);
		});

		it('returns defaults when stored payload has version 0', () => {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ version: 0, settings: customSettings() }),
			);
			expect(loadSettings()).toEqual(
				DEFAULT_SETTINGS as TextCounterSettings,
			);
		});

		it('returns defaults when stored payload is an empty object', () => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({}));
			expect(loadSettings()).toEqual(
				DEFAULT_SETTINGS as TextCounterSettings,
			);
		});

		it('returns defaults when settings is not an object', () => {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ version: 1, settings: null }),
			);
			expect(loadSettings()).toEqual(
				DEFAULT_SETTINGS as TextCounterSettings,
			);
		});
	});

	describe('round-trip', () => {
		it('saveSettings then loadSettings returns the saved object', () => {
			const s = customSettings();
			saveSettings(s);
			expect(loadSettings()).toEqual(s);
		});

		it('round-trips a target with custom enabled/unit/value', () => {
			const s: TextCounterSettings = {
				...DEFAULT_SETTINGS,
				target: { enabled: true, unit: 'words', value: 500 },
			};
			saveSettings(s);
			const loaded = loadSettings();
			expect(loaded.target).toEqual({
				enabled: true,
				unit: 'words',
				value: 500,
			});
		});
	});

	describe('merge-onto-defaults (forward-compat regression)', () => {
		it('fills missing keys from defaults while preserving stored values (additive change resilience)', () => {
			// Simulate a v1 payload from before `showReadingTime` was added: omit that key.
			const partialSettings: Record<string, unknown> = {
				countWhitespaceAsCharacter: false,
				countLineBreaksAsCharacter: true,
				wordRule: 'alphanumeric',
				showSentences: false,
				showParagraphs: false,
				// showReadingTime intentionally omitted
				showSpeakingTime: true,
				readingWpm: 300,
				speakingWpm: 150,
				target: { enabled: true, unit: 'words', value: 500 },
			};
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ version: 1, settings: partialSettings }),
			);
			const loaded = loadSettings();

			// Missing key filled from default
			expect(loaded.showReadingTime).toBe(
				DEFAULT_SETTINGS.showReadingTime,
			);
			// All other stored keys preserved
			expect(loaded.countWhitespaceAsCharacter).toBe(false);
			expect(loaded.countLineBreaksAsCharacter).toBe(true);
			expect(loaded.wordRule).toBe('alphanumeric');
			expect(loaded.showSentences).toBe(false);
			expect(loaded.showParagraphs).toBe(false);
			expect(loaded.showSpeakingTime).toBe(true);
			expect(loaded.readingWpm).toBe(300);
			expect(loaded.speakingWpm).toBe(150);
			expect(loaded.target).toEqual({
				enabled: true,
				unit: 'words',
				value: 500,
			});
		});

		it('partial target object merges with the default target', () => {
			const partial = {
				...DEFAULT_SETTINGS,
				target: { enabled: true }, // missing unit + value
			};
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ version: 1, settings: partial }),
			);
			const loaded = loadSettings();
			expect(loaded.target.enabled).toBe(true);
			expect(loaded.target.unit).toBe(DEFAULT_SETTINGS.target.unit);
			expect(loaded.target.value).toBe(DEFAULT_SETTINGS.target.value);
		});

		it('drops unknown keys on load and does not re-emit them on save', () => {
			const dirty = {
				...DEFAULT_SETTINGS,
				legacyFooBar: true,
				someOldKey: 'gone',
			};
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ version: 1, settings: dirty }),
			);
			const loaded = loadSettings();
			expect(Object.keys(loaded).sort()).toEqual(
				Object.keys(DEFAULT_SETTINGS).sort(),
			);

			// Save, reload, confirm unknown keys did not survive
			saveSettings(loaded);
			const raw = localStorage.getItem(STORAGE_KEY);
			expect(raw).toBeTruthy();
			const parsed = JSON.parse(raw as string);
			expect(Object.keys(parsed.settings).sort()).toEqual(
				Object.keys(DEFAULT_SETTINGS).sort(),
			);
		});
	});

	describe('resetSettings', () => {
		it('removes the stored key and returns defaults', () => {
			saveSettings(customSettings());
			expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();

			const result = resetSettings();
			expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
			expect(result).toEqual(DEFAULT_SETTINGS as TextCounterSettings);
			expect(loadSettings()).toEqual(
				DEFAULT_SETTINGS as TextCounterSettings,
			);
		});

		it('returns defaults even when no value was stored', () => {
			expect(resetSettings()).toEqual(
				DEFAULT_SETTINGS as TextCounterSettings,
			);
		});
	});

	describe('defensive copy of defaults', () => {
		it('mutating the returned settings does not affect future loadSettings calls', () => {
			const a = loadSettings();
			a.readingWpm = 9999;
			a.target.value = 99999;
			const b = loadSettings();
			expect(b.readingWpm).toBe(DEFAULT_SETTINGS.readingWpm);
			expect(b.target.value).toBe(DEFAULT_SETTINGS.target.value);
		});
	});
});
