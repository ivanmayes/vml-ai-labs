import type {
	TextCounterSettings,
	TextStats,
} from '../models/text-counter.types';

const ALPHANUMERIC_TOKEN = /[\p{L}\p{N}']+/gu;
const NON_NEWLINE_WHITESPACE = /[^\S\n]/g;
const NEWLINE = /\n/g;
const SENTENCE_SPLIT = /[.!?]+(?:\s|$)/;
const PARAGRAPH_SPLIT = /\n\s*\n+/;

function countMatches(text: string, pattern: RegExp): number {
	return (text.match(pattern) || []).length;
}

export function computeStats(
	text: string,
	settings: TextCounterSettings,
): TextStats {
	const characters = countCharacters(text, settings);
	const words = countWords(text, settings.wordRule);
	const lines = text === '' ? 0 : text.split('\n').length;
	const sentences = countSentences(text);
	const paragraphs = countParagraphs(text);
	const readingTimeMinutes =
		settings.readingWpm > 0 ? Math.ceil(words / settings.readingWpm) : 0;
	const speakingTimeMinutes =
		settings.speakingWpm > 0 ? Math.ceil(words / settings.speakingWpm) : 0;

	let overTarget = false;
	if (settings.target.enabled) {
		const current =
			settings.target.unit === 'characters' ? characters : words;
		overTarget = current > settings.target.value;
	}

	return {
		characters,
		words,
		lines,
		sentences,
		paragraphs,
		readingTimeMinutes,
		speakingTimeMinutes,
		overTarget,
	};
}

function countCharacters(text: string, settings: TextCounterSettings): number {
	let n = text.length;
	if (!settings.countLineBreaksAsCharacter) {
		n -= countMatches(text, NEWLINE);
	}
	if (!settings.countWhitespaceAsCharacter) {
		n -= countMatches(text, NON_NEWLINE_WHITESPACE);
	}
	return n;
}

function countWords(
	text: string,
	rule: TextCounterSettings['wordRule'],
): number {
	const trimmed = text.trim();
	if (trimmed.length === 0) return 0;
	if (rule === 'whitespace') {
		return trimmed.split(/\s+/).length;
	}
	return countMatches(text, ALPHANUMERIC_TOKEN);
}

function countSentences(text: string): number {
	if (text.trim().length === 0) return 0;
	return text
		.split(SENTENCE_SPLIT)
		.filter((segment) => segment.trim().length > 0).length;
}

function countParagraphs(text: string): number {
	if (text.trim().length === 0) return 0;
	return text
		.split(PARAGRAPH_SPLIT)
		.filter((segment) => segment.trim().length > 0).length;
}
