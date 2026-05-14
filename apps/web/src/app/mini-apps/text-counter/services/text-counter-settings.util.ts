import type {
	TextCounterSettings,
	TextCounterTarget,
} from '../models/text-counter.types';

const STORAGE_KEY = 'text-counter:settings:v1';
const SCHEMA_VERSION = 1;

export const DEFAULT_SETTINGS: Readonly<TextCounterSettings> = Object.freeze({
	countWhitespaceAsCharacter: true,
	countLineBreaksAsCharacter: false,
	wordRule: 'whitespace',
	showSentences: true,
	showParagraphs: true,
	showReadingTime: true,
	showSpeakingTime: false,
	readingWpm: 250,
	speakingWpm: 130,
	target: Object.freeze({
		enabled: false,
		unit: 'characters',
		value: 280,
	}) as TextCounterTarget,
}) as TextCounterSettings;

function freshDefaults(): TextCounterSettings {
	return {
		...DEFAULT_SETTINGS,
		target: { ...DEFAULT_SETTINGS.target },
	};
}

function hasLocalStorage(): boolean {
	return typeof localStorage !== 'undefined';
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeTarget(stored: Record<string, unknown>): TextCounterTarget {
	const targetResult: TextCounterTarget = { ...DEFAULT_SETTINGS.target };
	const targetKeys = Object.keys(
		DEFAULT_SETTINGS.target,
	) as (keyof TextCounterTarget)[];
	for (const tKey of targetKeys) {
		if (tKey in stored) {
			(targetResult as unknown as Record<string, unknown>)[tKey] =
				stored[tKey];
		}
	}
	return targetResult;
}

function mergeOntoDefaults(
	stored: Record<string, unknown>,
): TextCounterSettings {
	const result = freshDefaults();
	const knownKeys = Object.keys(
		DEFAULT_SETTINGS,
	) as (keyof TextCounterSettings)[];
	for (const key of knownKeys) {
		if (!(key in stored)) continue;
		const value = stored[key];
		if (key === 'target' && isObject(value)) {
			result.target = mergeTarget(value);
		} else if (key !== 'target') {
			(result as unknown as Record<string, unknown>)[key] = value;
		}
	}
	return result;
}

export function loadSettings(): TextCounterSettings {
	if (!hasLocalStorage()) return freshDefaults();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw === null) return freshDefaults();
		const parsed = JSON.parse(raw);
		if (!isObject(parsed)) return freshDefaults();
		if (parsed['version'] !== SCHEMA_VERSION) return freshDefaults();
		const settings = parsed['settings'];
		if (!isObject(settings)) return freshDefaults();
		return mergeOntoDefaults(settings);
	} catch {
		return freshDefaults();
	}
}

export function saveSettings(settings: TextCounterSettings): void {
	if (!hasLocalStorage()) return;
	try {
		const payload = {
			version: SCHEMA_VERSION,
			settings,
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
	} catch {
		// Quota exceeded or storage disabled — next save may succeed; surface no error.
	}
}

export function resetSettings(): TextCounterSettings {
	if (hasLocalStorage()) {
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// Ignore
		}
	}
	return freshDefaults();
}
