/**
 * Text-counter Template Editor dialog.
 *
 * A PrimeNG `Dialog`-hosted form that lets any org user create, edit, or
 * delete a template. Inline rule-type forms via a `@switch` block — no
 * separate rule-editor sub-component (doc-review G4 resolution: keep V1
 * simple).
 *
 * Inputs:
 *   - `orgId` (required) — owning organization id passed to the
 *     templates service.
 *   - `mode` — `'create' | 'edit'`. In edit mode `template` must be set.
 *   - `template` — existing `Template` to seed the form (edit mode).
 *   - `visible` — two-way bound via `[(visible)]` / `visibleChange`.
 *
 * Outputs:
 *   - `saved` — emits the saved `Template` after a successful create or
 *     update.
 *   - `deleted` — emits the deleted template's id after a successful
 *     delete.
 *   - `closed` — emits when the user closes without saving.
 *   - `visibleChange` — two-way for `[(visible)]`.
 *
 * Validation mirrors the server-side DTO rules (G2, G3 plan resolutions):
 *   - Name: required, <= 255 chars, no control chars, no leading/
 *     trailing whitespace.
 *   - Field labels: required, <= 255 chars, no control chars (newlines
 *     rejected), no leading/trailing whitespace.
 *   - At least one field, at most 50 fields (mirrors the API cap).
 *   - Numeric rules: positive integer, max 99999 (task spec — the API
 *     accepts >=0 but a 0 max/min is meaningless).
 *   - `forbiddenWords`: <= 100 entries, each <= 200 chars.
 *
 * Side-effect-free until the user clicks Save / Delete; the dialog
 * stays open on API failure with the error surfaced inline.
 */
import { CommonModule } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	OnInit,
	computed,
	effect,
	inject,
	input,
	output,
	signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';

import { PrimeNgModule } from '../../../../shared/primeng.module';
import type { Rule } from '../../models/rule.types';
import type {
	CreateTemplatePayload,
	Template,
	TemplateFieldPayload,
	UpdateTemplatePayload,
} from '../../models/template.types';
import { extractErrorMessage } from '../../services/text-counter-shared.util';
import { TextCounterTemplatesService } from '../../services/text-counter-templates.service';

// -------------------------------------------------------------------
// Local types / constants
// -------------------------------------------------------------------

export type EditorMode = 'create' | 'edit';

interface FieldFormState {
	id?: string;
	label: string;
	rules: Rule[];
}

interface RuleTypeOption {
	label: string;
	value: Rule['type'];
}

// Reject control characters (U+0000-U+001F + U+007F). Mirrors the API's
// NoControlChars validator. Built via new RegExp so the source file stays
// ASCII (a literal regex would leave raw control bytes that make git diff
// treat the file as binary and prevent text-mode review).
// eslint-disable-next-line no-control-regex -- intentional deny-list against control chars in labels (G2)
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]');

const MAX_NAME_LENGTH = 255;
const MAX_LABEL_LENGTH = 255;
const MAX_FIELDS_PER_TEMPLATE = 50;
const MAX_RULES_PER_FIELD = 20;
const MAX_NUMERIC_RULE_VALUE = 99999;
const MAX_FORBIDDEN_WORDS = 100;
const MAX_FORBIDDEN_WORD_LENGTH = 200;

const RULE_TYPE_OPTIONS: RuleTypeOption[] = [
	{ label: 'Max characters', value: 'maxCharacters' },
	{ label: 'Max words', value: 'maxWords' },
	{ label: 'Min characters', value: 'minCharacters' },
	{ label: 'Min words', value: 'minWords' },
	{ label: 'Single line', value: 'singleLine' },
	{ label: 'Forbidden words', value: 'forbiddenWords' },
];

/**
 * Default-shape rule for a given type — used when the user appends a
 * new rule or switches an existing rule's type.
 */
function defaultRuleOfType(type: Rule['type']): Rule {
	switch (type) {
		case 'maxCharacters':
		case 'maxWords':
		case 'minCharacters':
		case 'minWords':
			return { type, value: 1 };
		case 'singleLine':
			return { type };
		case 'forbiddenWords':
			return { type, values: [] };
	}
}

@Component({
	selector: 'app-text-counter-template-editor',
	standalone: true,
	templateUrl: './text-counter-template-editor.component.html',
	styleUrls: ['./text-counter-template-editor.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		FormsModule,
		DialogModule,
		ConfirmDialogModule,
		InputTextModule,
		InputNumberModule,
		PrimeNgModule,
	],
})
export class TextCounterTemplateEditorComponent implements OnInit {
	// -----------------------------------------------------------------
	// Inputs / outputs
	// -----------------------------------------------------------------

	readonly orgId = input.required<string>();
	readonly mode = input<EditorMode>('create');
	readonly template = input<Template | null>(null);
	readonly visible = input<boolean>(false);

	readonly saved = output<Template>();
	readonly deleted = output<string>();
	readonly visibleChange = output<boolean>();
	readonly closed = output<void>();

	// -----------------------------------------------------------------
	// Internal form state
	// -----------------------------------------------------------------

	readonly name = signal<string>('');
	readonly fields = signal<FieldFormState[]>([]);
	readonly saving = signal<boolean>(false);
	readonly error = signal<string | null>(null);

	readonly ruleTypeOptions = RULE_TYPE_OPTIONS;

	// -----------------------------------------------------------------
	// Validation
	// -----------------------------------------------------------------

	readonly isNameValid = computed(() => isValidName(this.name()));

	readonly fieldErrors = computed(() => {
		const list = this.fields();
		return list.map((f) => validateField(f));
	});

	readonly isValid = computed(() => {
		if (!this.isNameValid()) return false;
		const list = this.fields();
		if (list.length === 0) return false;
		if (list.length > MAX_FIELDS_PER_TEMPLATE) return false;
		return this.fieldErrors().every((err) => err === null);
	});

	// -----------------------------------------------------------------
	// DI
	// -----------------------------------------------------------------

	private readonly templatesService = inject(TextCounterTemplatesService);
	private readonly confirmationService = inject(ConfirmationService);
	private readonly destroyRef = inject(DestroyRef);

	// -----------------------------------------------------------------
	// Lifecycle: re-seed form whenever the dialog opens
	// -----------------------------------------------------------------

	constructor() {
		// When `visible` flips to true, seed (or reset) the form. We don't
		// touch state while the dialog is hidden so re-opens always start
		// from a clean slate.
		effect(() => {
			if (this.visible()) {
				this.seedFormFromInputs();
			}
		});
	}

	ngOnInit(): void {
		// If the parent renders the editor with `visible=true` from the
		// start, the effect above already seeds. This is here for cases
		// where the parent toggles `visible` before the first CD cycle.
		if (this.visible()) {
			this.seedFormFromInputs();
		}
	}

	// -----------------------------------------------------------------
	// Public API
	// -----------------------------------------------------------------

	get headerLabel(): string {
		return this.mode() === 'edit' ? 'Edit template' : 'New template';
	}

	onNameChange(value: string | null | undefined): void {
		this.name.set(value ?? '');
	}

	addField(): void {
		this.fields.update((list) => {
			if (list.length >= MAX_FIELDS_PER_TEMPLATE) return list;
			return [...list, { label: '', rules: [] }];
		});
	}

	removeField(index: number): void {
		this.fields.update((list) => list.filter((_, i) => i !== index));
	}

	moveFieldUp(index: number): void {
		if (index <= 0) return;
		this.fields.update((list) => {
			const next = [...list];
			[next[index - 1], next[index]] = [next[index], next[index - 1]];
			return next;
		});
	}

	moveFieldDown(index: number): void {
		this.fields.update((list) => {
			if (index >= list.length - 1) return list;
			const next = [...list];
			[next[index + 1], next[index]] = [next[index], next[index + 1]];
			return next;
		});
	}

	updateFieldLabel(index: number, label: string | null | undefined): void {
		this.fields.update((list) =>
			list.map((f, i) =>
				i === index ? { ...f, label: label ?? '' } : f,
			),
		);
	}

	addRule(fieldIndex: number, type: Rule['type']): void {
		this.fields.update((list) =>
			list.map((f, i) => {
				if (i !== fieldIndex) return f;
				if (f.rules.length >= MAX_RULES_PER_FIELD) return f;
				return { ...f, rules: [...f.rules, defaultRuleOfType(type)] };
			}),
		);
	}

	removeRule(fieldIndex: number, ruleIndex: number): void {
		this.fields.update((list) =>
			list.map((f, i) =>
				i !== fieldIndex
					? f
					: {
							...f,
							rules: f.rules.filter((_, ri) => ri !== ruleIndex),
						},
			),
		);
	}

	changeRuleType(
		fieldIndex: number,
		ruleIndex: number,
		type: Rule['type'],
	): void {
		this.fields.update((list) =>
			list.map((f, i) =>
				i !== fieldIndex
					? f
					: {
							...f,
							rules: f.rules.map((r, ri) =>
								ri !== ruleIndex ? r : defaultRuleOfType(type),
							),
						},
			),
		);
	}

	updateNumericRuleValue(
		fieldIndex: number,
		ruleIndex: number,
		value: number | null | undefined,
	): void {
		this.fields.update((list) =>
			list.map((f, i) =>
				i !== fieldIndex
					? f
					: {
							...f,
							rules: f.rules.map((r, ri) => {
								if (ri !== ruleIndex) return r;
								if (
									r.type === 'maxCharacters' ||
									r.type === 'maxWords' ||
									r.type === 'minCharacters' ||
									r.type === 'minWords'
								) {
									return { ...r, value: value ?? 0 };
								}
								return r;
							}),
						},
			),
		);
	}

	/**
	 * Parse a comma- or newline-separated string into a list of words
	 * for a `forbiddenWords` rule. Whitespace is trimmed and empty
	 * entries are dropped — the displayed string is the source of truth
	 * for the textarea so the user sees what they typed.
	 */
	updateForbiddenWordsText(
		fieldIndex: number,
		ruleIndex: number,
		text: string | null | undefined,
	): void {
		const raw = text ?? '';
		const values = raw
			.split(/[,\n]/)
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		this.fields.update((list) =>
			list.map((f, i) =>
				i !== fieldIndex
					? f
					: {
							...f,
							rules: f.rules.map((r, ri) => {
								if (ri !== ruleIndex) return r;
								if (r.type !== 'forbiddenWords') return r;
								return { ...r, values };
							}),
						},
			),
		);
	}

	forbiddenWordsDisplay(rule: Rule): string {
		if (rule.type !== 'forbiddenWords') return '';
		return rule.values.join(', ');
	}

	forbiddenWordsCount(rule: Rule): number {
		if (rule.type !== 'forbiddenWords') return 0;
		return rule.values.length;
	}

	numericRuleValue(rule: Rule): number {
		if (
			rule.type === 'maxCharacters' ||
			rule.type === 'maxWords' ||
			rule.type === 'minCharacters' ||
			rule.type === 'minWords'
		) {
			return rule.value;
		}
		return 0;
	}

	ruleTypeLabel(type: Rule['type']): string {
		return RULE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
	}

	maxFields(): number {
		return MAX_FIELDS_PER_TEMPLATE;
	}

	maxForbiddenWords(): number {
		return MAX_FORBIDDEN_WORDS;
	}

	// -----------------------------------------------------------------
	// Save / delete / cancel
	// -----------------------------------------------------------------

	onSave(): void {
		if (!this.isValid() || this.saving()) return;
		const payload = this.buildPayload();
		this.saving.set(true);
		this.error.set(null);

		const orgId = this.orgId();
		const tpl = this.template();
		const obs =
			this.mode() === 'edit' && tpl
				? this.templatesService.update(orgId, tpl.id, payload)
				: this.templatesService.create(orgId, payload);

		obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
			next: (savedTpl) => {
				this.saving.set(false);
				this.saved.emit(savedTpl);
				this.setVisible(false);
			},
			error: (err: unknown) => {
				this.saving.set(false);
				this.error.set(
					extractErrorMessage(err, { fallback: 'Save failed.' }),
				);
			},
		});
	}

	onDelete(): void {
		if (this.mode() !== 'edit') return;
		const tpl = this.template();
		if (!tpl || this.saving()) return;

		this.confirmationService.confirm({
			message: `Delete template "${tpl.name}"? This cannot be undone.`,
			header: 'Delete template',
			icon: 'pi pi-exclamation-triangle',
			acceptLabel: 'Delete',
			rejectLabel: 'Cancel',
			acceptButtonProps: { severity: 'danger' },
			accept: () => this.performDelete(tpl.id),
		});
	}

	onCancel(): void {
		this.closed.emit();
		this.setVisible(false);
	}

	onDialogVisibleChange(value: boolean): void {
		if (!value) {
			// Fired by the dialog when the user uses the X / ESC / mask. We
			// treat that as a cancel.
			this.closed.emit();
			this.visibleChange.emit(false);
		}
	}

	// -----------------------------------------------------------------
	// Internals
	// -----------------------------------------------------------------

	private performDelete(id: string): void {
		this.saving.set(true);
		this.error.set(null);
		const orgId = this.orgId();
		this.templatesService
			.delete(orgId, id)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.saving.set(false);
					this.deleted.emit(id);
					this.setVisible(false);
				},
				error: (err: unknown) => {
					this.saving.set(false);
					this.error.set(
						extractErrorMessage(err, {
							fallback: 'Delete failed.',
						}),
					);
				},
			});
	}

	private seedFormFromInputs(): void {
		this.error.set(null);
		this.saving.set(false);
		const tpl = this.template();
		if (this.mode() === 'edit' && tpl) {
			this.name.set(tpl.name);
			this.fields.set(
				tpl.fields.map((f) => ({
					id: f.id,
					label: f.label,
					// Deep-copy rules so edits don't mutate the input
					rules: f.rules.map((r) => ({ ...r }) as Rule),
				})),
			);
		} else {
			this.name.set('');
			this.fields.set([{ label: '', rules: [] }]);
		}
	}

	private buildPayload(): CreateTemplatePayload & UpdateTemplatePayload {
		// API does NOT accept `position` on the wire — it derives position
		// from array index on the server side. Sending `position` triggers
		// class-validator's forbidNonWhitelisted: true → 400. We honor that
		// contract here: serialize fields in the user's desired order, and
		// the server numbers them.
		const fields: TemplateFieldPayload[] = this.fields().map((f) => {
			const base: TemplateFieldPayload = {
				label: f.label,
				rules: f.rules.map((r) => ({ ...r }) as Rule),
			};
			// Preserve field id on update so the API can match the row
			// in place rather than regenerating UUIDs (which would
			// orphan any client-side state keyed by the id).
			if (f.id) base.id = f.id;
			return base;
		});
		return { name: this.name(), fields };
	}

	private setVisible(value: boolean): void {
		this.visibleChange.emit(value);
	}
}

// ---------------------------------------------------------------------
// Pure validation helpers — exported for the spec file.
// ---------------------------------------------------------------------

export function isValidName(name: string): boolean {
	if (typeof name !== 'string') return false;
	if (name.length === 0) return false;
	if (name.length > MAX_NAME_LENGTH) return false;
	if (CONTROL_CHARS.test(name)) return false;
	if (name !== name.trim()) return false;
	return true;
}

export function isValidLabel(label: string): boolean {
	if (typeof label !== 'string') return false;
	if (label.length === 0) return false;
	if (label.length > MAX_LABEL_LENGTH) return false;
	if (CONTROL_CHARS.test(label)) return false;
	if (label !== label.trim()) return false;
	return true;
}

function validateNumericRule(type: string, value: number): string | null {
	if (!Number.isInteger(value)) {
		return `${type} value must be an integer`;
	}
	if (value <= 0) {
		return `${type} value must be a positive integer`;
	}
	if (value > MAX_NUMERIC_RULE_VALUE) {
		return `${type} value must be at most ${MAX_NUMERIC_RULE_VALUE}`;
	}
	return null;
}

function validateForbiddenWordsRule(values: string[]): string | null {
	if (!Array.isArray(values)) {
		return 'forbiddenWords must be an array';
	}
	if (values.length > MAX_FORBIDDEN_WORDS) {
		return `forbiddenWords supports up to ${MAX_FORBIDDEN_WORDS} terms`;
	}
	for (const v of values) {
		if (typeof v !== 'string') {
			return 'forbiddenWords terms must be strings';
		}
		if (v.length > MAX_FORBIDDEN_WORD_LENGTH) {
			return `forbiddenWords terms must be <= ${MAX_FORBIDDEN_WORD_LENGTH} chars`;
		}
	}
	return null;
}

export function validateRuleClientSide(rule: Rule): string | null {
	switch (rule.type) {
		case 'maxCharacters':
		case 'maxWords':
		case 'minCharacters':
		case 'minWords':
			return validateNumericRule(rule.type, rule.value);
		case 'singleLine':
			return null;
		case 'forbiddenWords':
			return validateForbiddenWordsRule(rule.values);
	}
}

export function validateField(field: FieldFormState): string | null {
	if (!isValidLabel(field.label)) {
		return 'invalid label';
	}
	if (field.rules.length > MAX_RULES_PER_FIELD) {
		return `too many rules (max ${MAX_RULES_PER_FIELD})`;
	}
	for (const rule of field.rules) {
		const err = validateRuleClientSide(rule);
		if (err) return err;
	}
	return null;
}
