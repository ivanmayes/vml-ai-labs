import type { Rule, RuleResult } from '../models/rule.types';
import type { TextCounterSettings } from '../models/text-counter.types';

import { computeStats } from './text-counter.util';

/**
 * Lowercase the text and each rule term once, then walk the terms
 * looking for substring matches. Returns the original-casing terms
 * that matched (for display in the failure detail).
 *
 * Pulled out of `evaluateRule` so the dispatch stays under the cognitive
 * complexity budget; previously both sides were lowercased on every
 * iteration which got expensive for live keystroke evaluation.
 */
function matchForbiddenTerms(text: string, terms: string[]): string[] {
	const loweredText = text.toLowerCase();
	const loweredTerms = terms.map((t) => t.toLowerCase());
	const matched: string[] = [];
	for (let i = 0; i < loweredTerms.length; i++) {
		const term = loweredTerms[i];
		if (term.length > 0 && loweredText.includes(term)) {
			matched.push(terms[i]);
		}
	}
	return matched;
}

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
			const matched = matchForbiddenTerms(text, rule.values);
			const pass = matched.length === 0;
			return {
				rule,
				pass,
				detail: pass ? undefined : `contains: ${matched.join(', ')}`,
			};
		}
	}
}
