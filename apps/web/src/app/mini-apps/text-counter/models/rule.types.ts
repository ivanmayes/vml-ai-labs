export type Rule =
	| { type: 'maxCharacters'; value: number }
	| { type: 'maxWords'; value: number }
	| { type: 'minCharacters'; value: number }
	| { type: 'minWords'; value: number }
	| { type: 'singleLine' }
	| { type: 'forbiddenWords'; values: string[] };

export interface RuleResult {
	rule: Rule;
	pass: boolean;
	detail?: string;
}
