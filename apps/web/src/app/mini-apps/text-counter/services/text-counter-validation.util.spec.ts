import type { Rule } from '../models/rule.types';
import type { TextCounterSettings } from '../models/text-counter.types';

import { evaluateRules } from './text-counter-validation.util';

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

describe('evaluateRules', () => {
	it('returns an empty results array for an empty rules array', () => {
		const results = evaluateRules(
			'whatever text here',
			[],
			defaultSettings(),
		);
		expect(results).toEqual([]);
	});

	it('AE4: "This is a longer headline\\nwith a break" fails both maxCharacters and singleLine with appropriate details', () => {
		const text = 'This is a longer headline\nwith a break';
		const rules: Rule[] = [
			{ type: 'maxCharacters', value: 25 },
			{ type: 'singleLine' },
		];
		const results = evaluateRules(text, rules, defaultSettings());

		expect(results.length).toBe(2);

		// First rule: maxCharacters fails. With default settings,
		// countLineBreaksAsCharacter=false so the \n is excluded → 37 characters.
		expect(results[0].rule).toEqual({ type: 'maxCharacters', value: 25 });
		expect(results[0].pass).toBe(false);
		expect(results[0].detail).toBe('37 / 25 characters');

		// Second rule: singleLine fails because of the \n.
		expect(results[1].rule).toEqual({ type: 'singleLine' });
		expect(results[1].pass).toBe(false);
		expect(results[1].detail).toBeDefined();
	});

	it('preserves rule order across mixed pass/fail results', () => {
		const text = 'short';
		const rules: Rule[] = [
			{ type: 'maxCharacters', value: 100 }, // pass
			{ type: 'minCharacters', value: 50 }, // fail
			{ type: 'singleLine' }, // pass
		];
		const results = evaluateRules(text, rules, defaultSettings());

		expect(results.length).toBe(3);
		expect(results[0].rule).toEqual({ type: 'maxCharacters', value: 100 });
		expect(results[0].pass).toBe(true);
		expect(results[1].rule).toEqual({ type: 'minCharacters', value: 50 });
		expect(results[1].pass).toBe(false);
		expect(results[2].rule).toEqual({ type: 'singleLine' });
		expect(results[2].pass).toBe(true);
	});

	describe('maxCharacters', () => {
		it('passes when characters equal value', () => {
			const text = '12345';
			const results = evaluateRules(
				text,
				[{ type: 'maxCharacters', value: 5 }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(true);
			expect(results[0].detail).toBeUndefined();
		});

		it('passes with empty text', () => {
			const results = evaluateRules(
				'',
				[{ type: 'maxCharacters', value: 25 }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(true);
		});

		it('fails when characters exceed value with "actual / limit characters" detail', () => {
			const text = 'a'.repeat(35);
			const results = evaluateRules(
				text,
				[{ type: 'maxCharacters', value: 25 }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(false);
			expect(results[0].detail).toBe('35 / 25 characters');
		});
	});

	describe('maxWords', () => {
		it('passes when words equal value', () => {
			const results = evaluateRules(
				'one two three',
				[{ type: 'maxWords', value: 3 }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(true);
		});

		it('fails when words exceed value with "actual / limit words" detail', () => {
			const results = evaluateRules(
				'one two three four five six seven',
				[{ type: 'maxWords', value: 5 }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(false);
			expect(results[0].detail).toBe('7 / 5 words');
		});

		it('respects wordRule=whitespace: "hello-world test" counts as 2 words', () => {
			const results = evaluateRules(
				'hello-world test',
				[{ type: 'maxWords', value: 2 }],
				{ ...defaultSettings(), wordRule: 'whitespace' },
			);
			expect(results[0].pass).toBe(true);
		});

		it('respects wordRule=alphanumeric: "hello-world test" counts as 3 words and fails maxWords=2', () => {
			const results = evaluateRules(
				'hello-world test',
				[{ type: 'maxWords', value: 2 }],
				{ ...defaultSettings(), wordRule: 'alphanumeric' },
			);
			expect(results[0].pass).toBe(false);
			expect(results[0].detail).toBe('3 / 2 words');
		});
	});

	describe('minCharacters', () => {
		it('fails with empty text (drives R21 empty-field flagging)', () => {
			const results = evaluateRules(
				'',
				[{ type: 'minCharacters', value: 5 }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(false);
			expect(results[0].detail).toBe('0 / 5 characters');
		});

		it('passes when characters equal value', () => {
			const results = evaluateRules(
				'12345',
				[{ type: 'minCharacters', value: 5 }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(true);
			expect(results[0].detail).toBeUndefined();
		});

		it('passes when text comfortably exceeds the minimum', () => {
			const results = evaluateRules(
				'this is plenty of text',
				[{ type: 'minCharacters', value: 5 }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(true);
		});
	});

	describe('minWords', () => {
		it('fails with empty text', () => {
			const results = evaluateRules(
				'',
				[{ type: 'minWords', value: 3 }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(false);
			expect(results[0].detail).toBe('0 / 3 words');
		});

		it('passes when words equal value', () => {
			const results = evaluateRules(
				'one two three',
				[{ type: 'minWords', value: 3 }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(true);
		});
	});

	describe('singleLine', () => {
		it('passes with empty text (no line break exists)', () => {
			const results = evaluateRules(
				'',
				[{ type: 'singleLine' }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(true);
			expect(results[0].detail).toBeUndefined();
		});

		it('passes with a single line of text', () => {
			const results = evaluateRules(
				'one line of headline',
				[{ type: 'singleLine' }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(true);
		});

		it('fails when text contains a single \\n', () => {
			const results = evaluateRules(
				'line one\nline two',
				[{ type: 'singleLine' }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(false);
			expect(results[0].detail).toBeDefined();
		});

		it('fails when text has a trailing \\n', () => {
			const results = evaluateRules(
				'headline\n',
				[{ type: 'singleLine' }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(false);
		});

		it('fails when text contains a \\r (carriage return)', () => {
			const results = evaluateRules(
				'line one\rline two',
				[{ type: 'singleLine' }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(false);
		});
	});

	describe('forbiddenWords', () => {
		it('passes when none of the values appear in the text', () => {
			const results = evaluateRules(
				'A perfectly fine sentence.',
				[{ type: 'forbiddenWords', values: ['guaranteed', 'free'] }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(true);
			expect(results[0].detail).toBeUndefined();
		});

		it('matches case-insensitively and surfaces all matched terms', () => {
			const results = evaluateRules(
				'Limited time — free guaranteed!',
				[
					{
						type: 'forbiddenWords',
						values: ['Free', 'GUARANTEED'],
					},
				],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(false);
			expect(results[0].detail).toBe('contains: Free, GUARANTEED');
		});

		it('matches substrings (not whole-word) — "limit" matches "unlimited"', () => {
			const results = evaluateRules(
				'unlimited offers inside',
				[{ type: 'forbiddenWords', values: ['limit'] }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(false);
			expect(results[0].detail).toBe('contains: limit');
		});

		it('passes when the values array is empty', () => {
			const results = evaluateRules(
				'anything goes here',
				[{ type: 'forbiddenWords', values: [] }],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(true);
			expect(results[0].detail).toBeUndefined();
		});

		it('lists only the terms that actually matched when some hit and some miss', () => {
			const results = evaluateRules(
				'free shipping today',
				[
					{
						type: 'forbiddenWords',
						values: ['free', 'guaranteed'],
					},
				],
				defaultSettings(),
			);
			expect(results[0].pass).toBe(false);
			expect(results[0].detail).toBe('contains: free');
		});
	});
});
