import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ConfirmationService } from 'primeng/api';
import { Observable, of, throwError } from 'rxjs';

import type { Rule } from '../../models/rule.types';
import type {
	CreateTemplatePayload,
	Template,
	UpdateTemplatePayload,
} from '../../models/template.types';
import { TextCounterTemplatesService } from '../../services/text-counter-templates.service';

import {
	TextCounterTemplateEditorComponent,
	isValidLabel,
	isValidName,
	validateField,
	validateRuleClientSide,
} from './text-counter-template-editor.component';

// ---------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------

const ORG_ID = 'org-123';

class TemplatesServiceStub {
	createCalls: { orgId: string; payload: CreateTemplatePayload }[] = [];
	updateCalls: {
		orgId: string;
		id: string;
		payload: UpdateTemplatePayload;
	}[] = [];
	deleteCalls: { orgId: string; id: string }[] = [];

	createImpl: (
		orgId: string,
		payload: CreateTemplatePayload,
	) => Observable<Template> = (_orgId, payload) =>
		of(makeTemplate({ name: payload.name }));

	updateImpl: (
		orgId: string,
		id: string,
		payload: UpdateTemplatePayload,
	) => Observable<Template> = (_orgId, id, payload) =>
		of(makeTemplate({ id, name: payload.name }));

	deleteImpl: (orgId: string, id: string) => Observable<void> = () =>
		of(undefined);

	list() {
		return of([] as Template[]);
	}
	get(_orgId: string, id: string) {
		return of(makeTemplate({ id }));
	}
	create(orgId: string, payload: CreateTemplatePayload) {
		this.createCalls.push({ orgId, payload });
		return this.createImpl(orgId, payload);
	}
	update(orgId: string, id: string, payload: UpdateTemplatePayload) {
		this.updateCalls.push({ orgId, id, payload });
		return this.updateImpl(orgId, id, payload);
	}
	delete(orgId: string, id: string) {
		this.deleteCalls.push({ orgId, id });
		return this.deleteImpl(orgId, id);
	}
}

function makeTemplate(overrides: Partial<Template> = {}): Template {
	return {
		id: overrides.id ?? 'tpl-1',
		organizationId: ORG_ID,
		createdById: 'user-1',
		name: overrides.name ?? 'Holiday Carousel',
		createdAt: '2026-05-18T00:00:00.000Z',
		updatedAt: '2026-05-18T00:00:00.000Z',
		fields: overrides.fields ?? [
			{
				id: 'field-1',
				label: 'headline',
				position: 0,
				rules: [{ type: 'maxCharacters', value: 25 }],
			},
		],
	};
}

interface FixtureBundle {
	fixture: ComponentFixture<TextCounterTemplateEditorComponent>;
	component: TextCounterTemplateEditorComponent;
	componentRef: ComponentRef<TextCounterTemplateEditorComponent>;
	templates: TemplatesServiceStub;
}

function makeFixture(initial?: {
	mode?: 'create' | 'edit';
	template?: Template | null;
	visible?: boolean;
}): FixtureBundle {
	const templates = new TemplatesServiceStub();
	TestBed.configureTestingModule({
		imports: [TextCounterTemplateEditorComponent],
		providers: [
			provideNoopAnimations(),
			ConfirmationService,
			{ provide: TextCounterTemplatesService, useValue: templates },
		],
	});
	const fixture = TestBed.createComponent(TextCounterTemplateEditorComponent);
	fixture.componentRef.setInput('orgId', ORG_ID);
	fixture.componentRef.setInput('mode', initial?.mode ?? 'create');
	fixture.componentRef.setInput('template', initial?.template ?? null);
	fixture.componentRef.setInput('visible', initial?.visible ?? true);
	fixture.detectChanges();
	return {
		fixture,
		component: fixture.componentInstance,
		componentRef: fixture.componentRef,
		templates,
	};
}

// ---------------------------------------------------------------------
// Pure validation helpers (exported from the component module)
// ---------------------------------------------------------------------

describe('TextCounterTemplateEditor — validation helpers', () => {
	describe('isValidName', () => {
		it('rejects empty, whitespace-bounded, control-char, or over-length names', () => {
			expect(isValidName('')).toBe(false);
			expect(isValidName(' hello')).toBe(false);
			expect(isValidName('hello ')).toBe(false);
			expect(isValidName('hello\nworld')).toBe(false);
			expect(isValidName('a'.repeat(256))).toBe(false);
		});

		it('accepts a reasonable name', () => {
			expect(isValidName('Holiday Carousel')).toBe(true);
			expect(isValidName('a'.repeat(255))).toBe(true);
		});
	});

	describe('isValidLabel', () => {
		it('rejects newlines (G2: control chars)', () => {
			expect(isValidLabel('head\nline')).toBe(false);
			expect(isValidLabel('head\rline')).toBe(false);
		});
		it('accepts a normal label', () => {
			expect(isValidLabel('headline')).toBe(true);
		});
	});

	describe('validateRuleClientSide', () => {
		it('rejects numeric rule value 0 (positive integer required)', () => {
			expect(
				validateRuleClientSide({ type: 'maxCharacters', value: 0 }),
			).not.toBeNull();
		});
		it('rejects numeric value > 99999', () => {
			expect(
				validateRuleClientSide({
					type: 'maxCharacters',
					value: 100000,
				}),
			).not.toBeNull();
		});
		it('accepts numeric value within range', () => {
			expect(
				validateRuleClientSide({ type: 'maxCharacters', value: 25 }),
			).toBeNull();
		});
		it('rejects forbiddenWords with > 100 entries (G3)', () => {
			const values = Array.from({ length: 101 }, (_, i) => `w${i}`);
			expect(
				validateRuleClientSide({ type: 'forbiddenWords', values }),
			).not.toBeNull();
		});
		it('rejects forbiddenWords with a > 200-char entry', () => {
			expect(
				validateRuleClientSide({
					type: 'forbiddenWords',
					values: ['a'.repeat(201)],
				}),
			).not.toBeNull();
		});
		it('accepts singleLine with no payload', () => {
			expect(validateRuleClientSide({ type: 'singleLine' })).toBeNull();
		});
	});

	describe('validateField', () => {
		it('rejects empty label', () => {
			expect(validateField({ label: '', rules: [] })).not.toBeNull();
		});
		it('rejects label with newline', () => {
			expect(
				validateField({ label: 'head\nline', rules: [] }),
			).not.toBeNull();
		});
		it('accepts a single valid field with no rules', () => {
			expect(validateField({ label: 'headline', rules: [] })).toBeNull();
		});
		it('rejects fields whose first rule is invalid', () => {
			expect(
				validateField({
					label: 'headline',
					rules: [{ type: 'maxCharacters', value: 0 }],
				}),
			).not.toBeNull();
		});
	});
});

// ---------------------------------------------------------------------
// Component behaviour
// ---------------------------------------------------------------------

describe('TextCounterTemplateEditorComponent', () => {
	// -----------------------------------------------------------------
	// Seeding
	// -----------------------------------------------------------------

	it('seeds an empty form when opened in create mode', () => {
		const { component } = makeFixture({ mode: 'create' });
		expect(component.name()).toBe('');
		expect(component.fields().length).toBe(1);
		expect(component.fields()[0].label).toBe('');
		expect(component.fields()[0].rules).toEqual([]);
	});

	it('seeds the form from the input template in edit mode', () => {
		const tpl = makeTemplate({
			name: 'Existing',
			fields: [
				{
					id: 'f1',
					label: 'headline',
					position: 0,
					rules: [{ type: 'maxCharacters', value: 25 }],
				},
				{
					id: 'f2',
					label: 'body',
					position: 1,
					rules: [{ type: 'singleLine' }],
				},
			],
		});
		const { component } = makeFixture({ mode: 'edit', template: tpl });
		expect(component.name()).toBe('Existing');
		expect(component.fields().length).toBe(2);
		expect(component.fields()[0].id).toBe('f1');
		expect(component.fields()[1].label).toBe('body');
	});

	it('deep-copies rules so edits do not mutate the input template', () => {
		const original: Rule = { type: 'maxCharacters', value: 25 };
		const tpl = makeTemplate({
			fields: [
				{
					id: 'f1',
					label: 'headline',
					position: 0,
					rules: [original],
				},
			],
		});
		const { component } = makeFixture({ mode: 'edit', template: tpl });
		component.updateNumericRuleValue(0, 0, 50);
		expect(original).toEqual({ type: 'maxCharacters', value: 25 });
		expect(
			(component.fields()[0].rules[0] as { value: number }).value,
		).toBe(50);
	});

	// -----------------------------------------------------------------
	// Validation reactive signal
	// -----------------------------------------------------------------

	it('disables save (isValid=false) when name is empty', () => {
		const { component } = makeFixture({ mode: 'create' });
		component.updateFieldLabel(0, 'headline');
		expect(component.isValid()).toBe(false);
	});

	it('disables save when any field has an empty label', () => {
		const { component } = makeFixture({ mode: 'create' });
		component.onNameChange('Holiday Carousel');
		// default fixture leaves field 0 with empty label
		expect(component.isValid()).toBe(false);
	});

	it('disables save when a numeric rule has value 0', () => {
		const { component } = makeFixture({ mode: 'create' });
		component.onNameChange('Holiday Carousel');
		component.updateFieldLabel(0, 'headline');
		component.addRule(0, 'maxCharacters');
		component.updateNumericRuleValue(0, 0, 0);
		expect(component.isValid()).toBe(false);
	});

	it('disables save when forbiddenWords has 101 entries', () => {
		const { component } = makeFixture({ mode: 'create' });
		component.onNameChange('Holiday Carousel');
		component.updateFieldLabel(0, 'headline');
		component.addRule(0, 'forbiddenWords');
		// directly poke the rule by replaying the text-update path
		const text = Array.from({ length: 101 }, (_, i) => `w${i}`).join(',');
		component.updateForbiddenWordsText(0, 0, text);
		expect(component.isValid()).toBe(false);
	});

	it('disables save when a field label contains a newline (control-char rejection)', () => {
		const { component } = makeFixture({ mode: 'create' });
		component.onNameChange('Holiday Carousel');
		component.updateFieldLabel(0, 'head\nline');
		expect(component.isValid()).toBe(false);
		expect(component.fieldErrors()[0]).not.toBeNull();
	});

	it('enables save with a valid name and one valid field', () => {
		const { component } = makeFixture({ mode: 'create' });
		component.onNameChange('Holiday Carousel');
		component.updateFieldLabel(0, 'headline');
		component.addRule(0, 'maxCharacters');
		component.updateNumericRuleValue(0, 0, 25);
		expect(component.isValid()).toBe(true);
	});

	// -----------------------------------------------------------------
	// Field / rule mutation
	// -----------------------------------------------------------------

	it('adds and removes fields', () => {
		const { component } = makeFixture({ mode: 'create' });
		component.addField();
		component.addField();
		expect(component.fields().length).toBe(3);
		component.removeField(1);
		expect(component.fields().length).toBe(2);
	});

	it('moves fields up and down (swap with neighbour)', () => {
		const { component } = makeFixture({ mode: 'create' });
		component.updateFieldLabel(0, 'first');
		component.addField();
		component.updateFieldLabel(1, 'second');
		component.addField();
		component.updateFieldLabel(2, 'third');

		component.moveFieldDown(0);
		expect(component.fields().map((f) => f.label)).toEqual([
			'second',
			'first',
			'third',
		]);
		component.moveFieldUp(2);
		expect(component.fields().map((f) => f.label)).toEqual([
			'second',
			'third',
			'first',
		]);
	});

	it('switching a rule type resets the payload to the default shape', () => {
		const { component } = makeFixture({ mode: 'create' });
		component.addRule(0, 'maxCharacters');
		component.updateNumericRuleValue(0, 0, 42);
		component.changeRuleType(0, 0, 'singleLine');
		expect(component.fields()[0].rules[0]).toEqual({ type: 'singleLine' });
		component.changeRuleType(0, 0, 'forbiddenWords');
		expect(component.fields()[0].rules[0]).toEqual({
			type: 'forbiddenWords',
			values: [],
		});
	});

	it('parses comma- and newline-separated forbiddenWords input', () => {
		const { component } = makeFixture({ mode: 'create' });
		component.addRule(0, 'forbiddenWords');
		component.updateForbiddenWordsText(0, 0, 'foo, bar\nbaz, , qux');
		const rule = component.fields()[0].rules[0];
		expect(rule).toEqual({
			type: 'forbiddenWords',
			values: ['foo', 'bar', 'baz', 'qux'],
		});
	});

	// -----------------------------------------------------------------
	// Save flow
	// -----------------------------------------------------------------

	it('create flow: calls templatesService.create with the expected payload, emits saved, hides dialog', () => {
		const { component, templates } = makeFixture({ mode: 'create' });
		const savedEvents: Template[] = [];
		const visibleEvents: boolean[] = [];
		component.saved.subscribe((t) => savedEvents.push(t));
		component.visibleChange.subscribe((v) => visibleEvents.push(v));

		component.onNameChange('Holiday Carousel');
		component.updateFieldLabel(0, 'headline');
		component.addRule(0, 'maxCharacters');
		component.updateNumericRuleValue(0, 0, 25);
		component.addRule(0, 'singleLine');

		const created = makeTemplate({
			name: 'Holiday Carousel',
			fields: [
				{
					id: 'f-new',
					label: 'headline',
					position: 0,
					rules: [
						{ type: 'maxCharacters', value: 25 },
						{ type: 'singleLine' },
					],
				},
			],
		});
		templates.createImpl = () => of(created);

		component.onSave();

		expect(templates.createCalls.length).toBe(1);
		expect(templates.createCalls[0].orgId).toBe(ORG_ID);
		expect(templates.createCalls[0].payload).toEqual({
			name: 'Holiday Carousel',
			fields: [
				{
					label: 'headline',
					position: 0,
					rules: [
						{ type: 'maxCharacters', value: 25 },
						{ type: 'singleLine' },
					],
				},
			],
		});
		expect(savedEvents).toEqual([created]);
		expect(visibleEvents).toContain(false);
		expect(component.saving()).toBe(false);
		expect(component.error()).toBeNull();
	});

	it('edit flow: calls templatesService.update with the right payload (positions reflect new order)', () => {
		const tpl = makeTemplate({
			id: 'tpl-edit',
			name: 'Original',
			fields: [
				{
					id: 'f1',
					label: 'headline',
					position: 0,
					rules: [{ type: 'maxCharacters', value: 25 }],
				},
				{
					id: 'f2',
					label: 'body',
					position: 1,
					rules: [{ type: 'singleLine' }],
				},
			],
		});
		const { component, templates } = makeFixture({
			mode: 'edit',
			template: tpl,
		});

		// Rename field, add a rule, remove a rule, reorder fields
		component.updateFieldLabel(0, 'main_headline');
		component.addRule(0, 'minCharacters');
		component.updateNumericRuleValue(0, 1, 3);
		component.removeRule(1, 0); // drop body's singleLine
		component.moveFieldDown(0); // swap so body comes first

		const updated = makeTemplate({ id: 'tpl-edit', name: 'Original' });
		templates.updateImpl = () => of(updated);

		const savedEvents: Template[] = [];
		component.saved.subscribe((t) => savedEvents.push(t));

		component.onSave();

		expect(templates.updateCalls.length).toBe(1);
		const call = templates.updateCalls[0];
		expect(call.id).toBe('tpl-edit');
		expect(call.payload.name).toBe('Original');
		expect(call.payload.fields.length).toBe(2);
		// After reorder: body is at index 0, main_headline at index 1
		expect(call.payload.fields[0].label).toBe('body');
		expect(call.payload.fields[0].position).toBe(0);
		expect(call.payload.fields[0].rules).toEqual([]);
		expect(call.payload.fields[1].label).toBe('main_headline');
		expect(call.payload.fields[1].position).toBe(1);
		expect(call.payload.fields[1].rules).toEqual([
			{ type: 'maxCharacters', value: 25 },
			{ type: 'minCharacters', value: 3 },
		]);
		expect(savedEvents).toEqual([updated]);
	});

	it('save error: keeps the dialog open and surfaces the message via the error signal', () => {
		const { component, templates } = makeFixture({ mode: 'create' });
		const savedEvents: Template[] = [];
		const visibleEvents: boolean[] = [];
		component.saved.subscribe((t) => savedEvents.push(t));
		component.visibleChange.subscribe((v) => visibleEvents.push(v));

		component.onNameChange('Holiday Carousel');
		component.updateFieldLabel(0, 'headline');

		templates.createImpl = () =>
			throwError(() => ({
				status: 400,
				error: { message: 'Bad request' },
			}));

		component.onSave();

		expect(component.saving()).toBe(false);
		expect(component.error()).toBe('Bad request');
		expect(savedEvents).toEqual([]);
		expect(visibleEvents).not.toContain(false);
	});

	// -----------------------------------------------------------------
	// Delete flow
	// -----------------------------------------------------------------

	it('delete flow: confirmation accepted → calls templatesService.delete and emits deleted', () => {
		const tpl = makeTemplate({ id: 'tpl-del' });
		const { component, templates, fixture } = makeFixture({
			mode: 'edit',
			template: tpl,
		});

		// Auto-accept any confirmation by spying on the component's
		// ConfirmationService instance (which is the one it actually
		// uses). Going through the fixture's injector guarantees we hit
		// the same instance the component received via inject().
		const confirmation =
			fixture.debugElement.injector.get(ConfirmationService);
		spyOn(confirmation, 'confirm').and.callFake((opts) => {
			opts.accept?.();
			return confirmation;
		});

		const deletedEvents: string[] = [];
		component.deleted.subscribe((id) => deletedEvents.push(id));

		component.onDelete();

		expect(templates.deleteCalls).toEqual([
			{ orgId: ORG_ID, id: 'tpl-del' },
		]);
		expect(deletedEvents).toEqual(['tpl-del']);
	});

	it('delete error: surfaces the error and keeps the dialog open', () => {
		const tpl = makeTemplate({ id: 'tpl-del' });
		const { component, templates, fixture } = makeFixture({
			mode: 'edit',
			template: tpl,
		});

		const confirmation =
			fixture.debugElement.injector.get(ConfirmationService);
		spyOn(confirmation, 'confirm').and.callFake((opts) => {
			opts.accept?.();
			return confirmation;
		});

		templates.deleteImpl = () =>
			throwError(() => ({
				status: 500,
				error: { message: 'Server down' },
			}));

		const deletedEvents: string[] = [];
		component.deleted.subscribe((id) => deletedEvents.push(id));

		component.onDelete();

		expect(deletedEvents).toEqual([]);
		expect(component.error()).toBe('Server down');
		expect(component.saving()).toBe(false);
	});

	// -----------------------------------------------------------------
	// Cancel / visibility plumbing
	// -----------------------------------------------------------------

	it('cancel: emits closed + visibleChange(false)', () => {
		const { component } = makeFixture({ mode: 'create' });
		const closedEvents: void[] = [];
		const visibleEvents: boolean[] = [];
		component.closed.subscribe(() => closedEvents.push(undefined as void));
		component.visibleChange.subscribe((v) => visibleEvents.push(v));

		component.onCancel();

		expect(closedEvents.length).toBe(1);
		expect(visibleEvents).toContain(false);
	});

	it('dialog visibleChange(false) emits closed + visibleChange(false)', () => {
		const { component } = makeFixture({ mode: 'create' });
		const closedEvents: void[] = [];
		const visibleEvents: boolean[] = [];
		component.closed.subscribe(() => closedEvents.push(undefined as void));
		component.visibleChange.subscribe((v) => visibleEvents.push(v));

		component.onDialogVisibleChange(false);

		expect(closedEvents.length).toBe(1);
		expect(visibleEvents).toContain(false);
	});

	// -----------------------------------------------------------------
	// Re-seeding on re-open
	// -----------------------------------------------------------------

	it('re-seeds on the next open after edits were made', () => {
		const tpl = makeTemplate({ name: 'Original' });
		const bundle = makeFixture({
			mode: 'edit',
			template: tpl,
			visible: true,
		});
		bundle.component.onNameChange('Edited');
		expect(bundle.component.name()).toBe('Edited');

		// Close + re-open should re-seed from the template input
		bundle.componentRef.setInput('visible', false);
		bundle.fixture.detectChanges();
		bundle.componentRef.setInput('visible', true);
		bundle.fixture.detectChanges();

		expect(bundle.component.name()).toBe('Original');
		expect(bundle.component.error()).toBeNull();
		expect(bundle.component.saving()).toBe(false);
	});
});
