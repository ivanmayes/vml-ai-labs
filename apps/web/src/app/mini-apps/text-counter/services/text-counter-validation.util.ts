import type { Rule, RuleResult } from '../models/rule.types';
import type { TextCounterSettings } from '../models/text-counter.types';

import { computeStats } from './text-counter.util';

export function evaluateRules(
	text: string,
	rules: Rule[],
	settings: TextCounterSettings,
): RuleResult[] {
	if (rules.length === 0) return [];
	const stats = computeStats(text, settings);
	return rules.map((rule) => evaluateRule(text, rule, stats));
}

function evaluateRule(
	text: string,
	rule: Rule,
	stats: { characters: number; words: number },
): RuleResult {
	switch (rule.type) {
		case 'maxCharacters': {
			const pass = stats.characters <= rule.value;
			return {
				rule,
				pass,
				detail: pass
					? undefined
					: `${stats.characters} / ${rule.value} characters`,
			};
		}
		case 'maxWords': {
			const pass = stats.words <= rule.value;
			return {
				rule,
				pass,
				detail: pass
					? undefined
					: `${stats.words} / ${rule.value} words`,
			};
		}
		case 'minCharacters': {
			const pass = stats.characters >= rule.value;
			return {
				rule,
				pass,
				detail: pass
					? undefined
					: `${stats.characters} / ${rule.value} characters`,
			};
		}
		case 'minWords': {
			const pass = stats.words >= rule.value;
			return {
				rule,
				pass,
				detail: pass
					? undefined
					: `${stats.words} / ${rule.value} words`,
			};
		}
		case 'singleLine': {
			const pass = !/[\n\r]/.test(text);
			return {
				rule,
				pass,
				detail: pass ? undefined : 'contains line break',
			};
		}
		case 'forbiddenWords': {
			const lowered = text.toLowerCase();
			const matched = rule.values.filter(
				(term) =>
					term.length > 0 && lowered.includes(term.toLowerCase()),
			);
			const pass = matched.length === 0;
			return {
				rule,
				pass,
				detail: pass ? undefined : `contains: ${matched.join(', ')}`,
			};
		}
	}
}
