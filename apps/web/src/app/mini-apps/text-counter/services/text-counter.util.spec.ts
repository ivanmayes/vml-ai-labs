import type { TextCounterSettings } from '../models/text-counter.types';

import { computeStats } from './text-counter.util';

function defaultSettings(): TextCounterSettings {
	return {
		countWhitespaceAsCharacter: true,
		countLineBreaksAsCharacter: false,
		wordRule: 'whitespace',
		showSentences: true,
		showParagraphs: true,
		showReadingTime: true,
		showSpeakingTime: false,
		readingWpm: 250,
		speakingWpm: 130,
		target: { enabled: false, unit: 'characters', value: 280 },
	};
}

describe('computeStats', () => {
	it('returns zeros for an empty string', () => {
		const stats = computeStats('', defaultSettings());
		expect(stats).toEqual({
			characters: 0,
			words: 0,
			lines: 0,
			sentences: 0,
			paragraphs: 0,
			readingTimeMinutes: 0,
			speakingTimeMinutes: 0,
			overTarget: false,
		});
	});

	it('counts "hello world" as 2 words, 11 characters, 1 line, 1 sentence, 1 paragraph', () => {
		const stats = computeStats('hello world', defaultSettings());
		expect(stats.characters).toBe(11);
		expect(stats.words).toBe(2);
		expect(stats.lines).toBe(1);
		expect(stats.sentences).toBe(1);
		expect(stats.paragraphs).toBe(1);
	});

	it('handles multi-paragraph input ("a.\\n\\nb!\\n\\nc?") with 3 sentences, 3 paragraphs, 3 words', () => {
		const stats = computeStats('a.\n\nb!\n\nc?', defaultSettings());
		expect(stats.words).toBe(3);
		expect(stats.sentences).toBe(3);
		expect(stats.paragraphs).toBe(3);
	});

	describe('character counting', () => {
		it('whitespace-only string: 3 chars when whitespace counted, 0 when not', () => {
			const incl = computeStats('   ', defaultSettings());
			expect(incl.characters).toBe(3);
			expect(incl.words).toBe(0);

			const excl = computeStats('   ', {
				...defaultSettings(),
				countWhitespaceAsCharacter: false,
			});
			expect(excl.characters).toBe(0);
		});

		it('"line1\\nline2\\nline3": 3 lines; chars=15 when line-breaks excluded (default), 17 when included', () => {
			const defaults = defaultSettings();
			const exclLineBreaks = computeStats(
				'line1\nline2\nline3',
				defaults,
			);
			expect(exclLineBreaks.lines).toBe(3);
			expect(exclLineBreaks.characters).toBe(15);

			const inclLineBreaks = computeStats('line1\nline2\nline3', {
				...defaults,
				countLineBreaksAsCharacter: true,
			});
			expect(inclLineBreaks.characters).toBe(17);
		});

		it('"a b\\nc": pinpoints order of operations across both flag states', () => {
			const text = 'a b\nc';
			const bothTrue = computeStats(text, {
				...defaultSettings(),
				countWhitespaceAsCharacter: true,
				countLineBreaksAsCharacter: true,
			});
			expect(bothTrue.characters).toBe(5);

			const lineBreaksFalseOnly = computeStats(text, {
				...defaultSettings(),
				countWhitespaceAsCharacter: true,
				countLineBreaksAsCharacter: false,
			});
			expect(lineBreaksFalseOnly.characters).toBe(4);

			const bothFalse = computeStats(text, {
				...defaultSettings(),
				countWhitespaceAsCharacter: false,
				countLineBreaksAsCharacter: false,
			});
			expect(bothFalse.characters).toBe(3);
		});
	});

	describe('word rule', () => {
		it('"don\'t can\'t" returns 2 words under both rules', () => {
			const ws = computeStats("don't can't", defaultSettings());
			expect(ws.words).toBe(2);

			const alpha = computeStats("don't can't", {
				...defaultSettings(),
				wordRule: 'alphanumeric',
			});
			expect(alpha.words).toBe(2);
		});

		it('"hello, world!" returns 2 words under both rules', () => {
			const ws = computeStats('hello, world!', defaultSettings());
			expect(ws.words).toBe(2);

			const alpha = computeStats('hello, world!', {
				...defaultSettings(),
				wordRule: 'alphanumeric',
			});
			expect(alpha.words).toBe(2);
		});

		it('"a1b2 c3-d4" returns 2 under whitespace rule and 3 under alphanumeric rule', () => {
			const ws = computeStats('a1b2 c3-d4', defaultSettings());
			expect(ws.words).toBe(2);

			const alpha = computeStats('a1b2 c3-d4', {
				...defaultSettings(),
				wordRule: 'alphanumeric',
			});
			expect(alpha.words).toBe(3);
		});

		it('leading/trailing whitespace does not inflate word count', () => {
			const stats = computeStats('  hello world  ', defaultSettings());
			expect(stats.words).toBe(2);
		});

		it('CJK pinning: "你好世界" returns 1 word under both rules (the `+` quantifier is greedy across consecutive letter chars) — limitation surfaced in UI footnote', () => {
			const ws = computeStats('你好世界', defaultSettings());
			expect(ws.words).toBe(1);

			const alpha = computeStats('你好世界', {
				...defaultSettings(),
				wordRule: 'alphanumeric',
			});
			expect(alpha.words).toBe(1);
		});

		it('CJK with spaces: "你好 世界" returns 2 words under both rules', () => {
			const ws = computeStats('你好 世界', defaultSettings());
			expect(ws.words).toBe(2);

			const alpha = computeStats('你好 世界', {
				...defaultSettings(),
				wordRule: 'alphanumeric',
			});
			expect(alpha.words).toBe(2);
		});
	});

	describe('reading and speaking time', () => {
		it('readingTimeMinutes = ceil(words / readingWpm)', () => {
			const text = Array.from({ length: 501 }, () => 'word').join(' ');
			const stats = computeStats(text, defaultSettings());
			expect(stats.words).toBe(501);
			expect(stats.readingTimeMinutes).toBe(3); // ceil(501 / 250)
		});

		it('returns 0 reading/speaking time when WPM is 0 (guards divide-by-zero)', () => {
			const stats = computeStats('hello world', {
				...defaultSettings(),
				readingWpm: 0,
				speakingWpm: 0,
			});
			expect(stats.readingTimeMinutes).toBe(0);
			expect(stats.speakingTimeMinutes).toBe(0);
		});
	});

	describe('target indicator', () => {
		it('overTarget flips true when characters exceeds target.value and unit is "characters"', () => {
			const settings = {
				...defaultSettings(),
				target: {
					enabled: true,
					unit: 'characters' as const,
					value: 5,
				},
			};
			expect(computeStats('hello world', settings).overTarget).toBe(true);
			expect(computeStats('hi', settings).overTarget).toBe(false);
		});

		it('overTarget evaluates against words when unit is "words"', () => {
			const settings = {
				...defaultSettings(),
				target: {
					enabled: true,
					unit: 'words' as const,
					value: 5,
				},
			};
			expect(computeStats('a b c d e f g', settings).overTarget).toBe(
				true,
			);
			expect(computeStats('hello world', settings).overTarget).toBe(
				false,
			);
		});

		it('overTarget stays false when target is disabled, even with high counts', () => {
			const stats = computeStats('a b c d e f g h i j', {
				...defaultSettings(),
				target: { enabled: false, unit: 'words', value: 1 },
			});
			expect(stats.overTarget).toBe(false);
		});

		it('round-trips a words-target faithfully', () => {
			const settings = {
				...defaultSettings(),
				target: {
					enabled: true,
					unit: 'words' as const,
					value: 500,
				},
			};
			const stats = computeStats('one two three', settings);
			expect(stats.overTarget).toBe(false);
		});
	});

	describe('purity', () => {
		it('returns the same result for the same inputs', () => {
			const s = defaultSettings();
			const a = computeStats('hello world', s);
			const b = computeStats('hello world', s);
			expect(a).toEqual(b);
		});
	});
});
