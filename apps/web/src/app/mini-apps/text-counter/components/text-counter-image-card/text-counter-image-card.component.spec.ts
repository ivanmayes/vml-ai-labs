import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { LiveAnnouncer } from '@angular/cdk/a11y';

import { DEFAULT_SETTINGS } from '../../services/text-counter-settings.util';
import type { Template, TemplateField } from '../../models/template.types';
import type { Rule } from '../../models/rule.types';
import type { TextCounterSettings } from '../../models/text-counter.types';

import {
	ImageCardState,
	TextCounterImageCardComponent,
	buildFailureTooltip,
	previewSnippet,
} from './text-counter-image-card.component';

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function makeField(
	id: string,
	label: string,
	rules: Rule[] = [],
): TemplateField {
	return { id, label, position: 0, rules };
}

function makeTemplate(fields: TemplateField[]): Template {
	return {
		id: 'tpl-1',
		organizationId: 'org-1',
		createdById: 'user-1',
		name: 'Holiday Carousel',
		createdAt: '2026-05-18T00:00:00.000Z',
		updatedAt: '2026-05-18T00:00:00.000Z',
		fields: fields.map((f, i) => ({ ...f, position: i })),
	};
}

function makeCard(overrides: Partial<ImageCardState> = {}): ImageCardState {
	return {
		id: overrides.id ?? 'card-1',
		file:
			overrides.file ??
			new File([new Uint8Array([1, 2])], 'a.png', {
				type: 'image/png',
			}),
		previewUrl: overrides.previewUrl ?? 'blob:fake',
		templateId: overrides.templateId ?? 'tpl-1',
		status: overrides.status ?? 'done',
		assignments: overrides.assignments ?? {},
		unassigned: overrides.unassigned ?? [],
		error: overrides.error ?? null,
	};
}

function freshSettings(): TextCounterSettings {
	return {
		...DEFAULT_SETTINGS,
		target: { ...DEFAULT_SETTINGS.target },
	};
}

class FakeAnnouncer {
	readonly messages: string[] = [];
	announce(message: string): Promise<void> {
		this.messages.push(message);
		return Promise.resolve();
	}
}

interface Bundle {
	fixture: ComponentFixture<TextCounterImageCardComponent>;
	component: TextCounterImageCardComponent;
	announcer: FakeAnnouncer;
}

function makeFixture(initial: {
	card: ImageCardState;
	templates: Template[];
	settings?: TextCounterSettings;
}): Bundle {
	const announcer = new FakeAnnouncer();
	TestBed.configureTestingModule({
		imports: [TextCounterImageCardComponent],
		providers: [
			provideNoopAnimations(),
			{ provide: LiveAnnouncer, useValue: announcer },
		],
	});
	const fixture = TestBed.createComponent(TextCounterImageCardComponent);
	fixture.componentRef.setInput('card', initial.card);
	fixture.componentRef.setInput('templates', initial.templates);
	fixture.componentRef.setInput('orgId', 'org-1');
	fixture.componentRef.setInput(
		'settings',
		initial.settings ?? freshSettings(),
	);
	fixture.detectChanges();
	return { fixture, component: fixture.componentInstance, announcer };
}

/**
 * Build a CdkDragDrop-shaped event sufficient for the handlers under
 * test. We only populate the fields the handler reads.
 */
function makeDropEvent(args: {
	previousContainerId: string;
	containerId: string;
	previousIndex: number;
	currentIndex: number;
	itemData: unknown;
}): CdkDragDrop<string[]> {
	return {
		previousContainer: { id: args.previousContainerId } as never,
		container: { id: args.containerId } as never,
		previousIndex: args.previousIndex,
		currentIndex: args.currentIndex,
		item: { data: args.itemData } as never,
		isPointerOverContainer: true,
		distance: { x: 0, y: 0 },
		dropPoint: { x: 0, y: 0 },
		event: new MouseEvent('drop'),
	} as unknown as CdkDragDrop<string[]>;
}

// ---------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------

describe('TextCounterImageCard — pure helpers', () => {
	it('previewSnippet truncates and collapses whitespace', () => {
		expect(previewSnippet('   hello   world  ')).toBe('hello world');
		expect(previewSnippet('a'.repeat(80)).length).toBeLessThanOrEqual(40);
		expect(previewSnippet('')).toBe('');
	});

	it('buildFailureTooltip joins rule-specific messages with separators', () => {
		const tooltip = buildFailureTooltip([
			{
				rule: { type: 'maxCharacters', value: 5 },
				pass: false,
				detail: '8 / 5 characters',
			},
			{ rule: { type: 'singleLine' }, pass: false },
		]);
		expect(tooltip).toContain('Over the 5-character limit');
		expect(tooltip).toContain('single line');
		expect(tooltip).toContain(' · ');
	});
});

// ---------------------------------------------------------------------
// AE2 — initial render with 4 fields + 1 unassigned
// ---------------------------------------------------------------------

describe('TextCounterImageCard — initial render (AE2)', () => {
	it('renders one field row per template field and the unassigned pool below', () => {
		const tpl = makeTemplate([
			makeField('f1', 'headline'),
			makeField('f2', 'subhead'),
			makeField('f3', 'body'),
			makeField('f4', 'cta'),
		]);
		const card = makeCard({
			assignments: {
				f1: 'HEAD',
				f2: 'sub',
				f3: 'body copy',
				f4: 'CTA',
			},
			unassigned: ['extra chunk'],
		});
		const { component, fixture } = makeFixture({
			card,
			templates: [tpl],
		});

		expect(component.fieldRows().length).toBe(4);
		expect(component.poolEntries().length).toBe(1);
		expect(component.poolEntries()[0].text).toBe('extra chunk');

		const fieldDroplists =
			fixture.nativeElement.querySelectorAll('.field-droplist');
		expect(fieldDroplists.length).toBe(4);
		expect(
			fixture.nativeElement.querySelector('.pool-droplist'),
		).not.toBeNull();
	});

	it('pool chunks include character/word counts (R20)', () => {
		const tpl = makeTemplate([makeField('f1', 'headline')]);
		const card = makeCard({
			assignments: { f1: 'HEAD' },
			unassigned: ['hello world'],
		});
		const { component } = makeFixture({ card, templates: [tpl] });

		const entry = component.poolEntries()[0];
		expect(entry.stats.characters).toBe('hello world'.length);
		expect(entry.stats.words).toBe(2);
	});
});

// ---------------------------------------------------------------------
// Drag-and-drop assignment (AE3, R16, R20)
// ---------------------------------------------------------------------

describe('TextCounterImageCard — drag & drop', () => {
	function setupFour(): {
		tpl: Template;
		card: ImageCardState;
		bundle: Bundle;
	} {
		const tpl = makeTemplate([
			makeField('headline', 'headline'),
			makeField('subhead', 'subhead'),
			makeField('body', 'body', [{ type: 'maxCharacters', value: 25 }]),
			makeField('disclaimer', 'disclaimer'),
		]);
		const card = makeCard({
			id: 'card-A',
			assignments: {
				headline: 'HEAD',
				subhead: 'sub',
				body: 'CONFETTI confetti confetti',
				disclaimer: '',
			},
			unassigned: [],
		});
		const bundle = makeFixture({ card, templates: [tpl] });
		return { tpl, card, bundle };
	}

	it('drag from body field to disclaimer empties body and fills disclaimer (AE3)', () => {
		const { card, bundle } = setupFour();
		const c = bundle.component;

		const movedText = card.assignments.body;
		const evt = makeDropEvent({
			previousContainerId: `field-${card.id}-body`,
			containerId: `field-${card.id}-disclaimer`,
			previousIndex: 0,
			currentIndex: 0,
			itemData: movedText,
		});

		const assignmentEvents: { fieldId: string; text: string }[] = [];
		c.assignmentChange.subscribe((e) => assignmentEvents.push(e));

		c.onFieldDropped(evt, 'disclaimer');

		// Two emissions: first sets disclaimer = movedText, then clears body.
		expect(assignmentEvents).toEqual([
			{ fieldId: 'disclaimer', text: movedText },
			{ fieldId: 'body', text: '' },
		]);
	});

	it('drag from a field back to the pool moves the chunk into the pool with counts (R20)', () => {
		const { card, bundle } = setupFour();
		const c = bundle.component;

		const movedText = card.assignments.headline;
		const evt = makeDropEvent({
			previousContainerId: `field-${card.id}-headline`,
			containerId: `pool-${card.id}`,
			previousIndex: 0,
			currentIndex: 0,
			itemData: movedText,
		});

		const unassignedEvents: string[][] = [];
		const assignmentEvents: { fieldId: string; text: string }[] = [];
		c.unassignedChange.subscribe((e) => unassignedEvents.push(e));
		c.assignmentChange.subscribe((e) => assignmentEvents.push(e));

		c.onPoolDropped(evt);

		expect(unassignedEvents.length).toBe(1);
		expect(unassignedEvents[0]).toEqual([movedText]);
		expect(assignmentEvents).toEqual([{ fieldId: 'headline', text: '' }]);
	});

	it('drag from pool to an empty field fills the field and removes the chunk from the pool', () => {
		const tpl = makeTemplate([makeField('headline', 'headline')]);
		const card = makeCard({
			id: 'card-B',
			assignments: { headline: '' },
			unassigned: ['hello'],
		});
		const { component } = makeFixture({ card, templates: [tpl] });

		const evt = makeDropEvent({
			previousContainerId: `pool-${card.id}`,
			containerId: `field-${card.id}-headline`,
			previousIndex: 0,
			currentIndex: 0,
			itemData: 'hello',
		});

		const unassignedEvents: string[][] = [];
		const assignmentEvents: { fieldId: string; text: string }[] = [];
		component.unassignedChange.subscribe((e) => unassignedEvents.push(e));
		component.assignmentChange.subscribe((e) => assignmentEvents.push(e));

		component.onFieldDropped(evt, 'headline');

		expect(assignmentEvents).toEqual([
			{ fieldId: 'headline', text: 'hello' },
		]);
		expect(unassignedEvents.length).toBe(1);
		expect(unassignedEvents[0]).toEqual([]);
	});

	it('drop onto a field with existing text displaces the old text into the pool (R16 / DQ1)', () => {
		const tpl = makeTemplate([
			makeField('headline', 'headline'),
			makeField('subhead', 'subhead'),
		]);
		const card = makeCard({
			id: 'card-C',
			assignments: { headline: 'NEW', subhead: 'OLD' },
			unassigned: [],
		});
		const { component } = makeFixture({ card, templates: [tpl] });

		const evt = makeDropEvent({
			previousContainerId: `field-${card.id}-headline`,
			containerId: `field-${card.id}-subhead`,
			previousIndex: 0,
			currentIndex: 0,
			itemData: 'NEW',
		});

		const unassignedEvents: string[][] = [];
		const assignmentEvents: { fieldId: string; text: string }[] = [];
		component.unassignedChange.subscribe((e) => unassignedEvents.push(e));
		component.assignmentChange.subscribe((e) => assignmentEvents.push(e));

		component.onFieldDropped(evt, 'subhead');

		// 1) subhead = NEW
		// 2) headline = '' (source cleared)
		// 3) pool gets OLD (displaced)
		expect(assignmentEvents).toEqual([
			{ fieldId: 'subhead', text: 'NEW' },
			{ fieldId: 'headline', text: '' },
		]);
		expect(unassignedEvents).toEqual([['OLD']]);
	});

	it('pool reorder keeps both chunks in the pool (no field change)', () => {
		const tpl = makeTemplate([makeField('headline', 'headline')]);
		const card = makeCard({
			id: 'card-D',
			assignments: { headline: 'H' },
			unassigned: ['first', 'second'],
		});
		const { component } = makeFixture({ card, templates: [tpl] });

		const evt = makeDropEvent({
			previousContainerId: `pool-${card.id}`,
			containerId: `pool-${card.id}`,
			previousIndex: 0,
			currentIndex: 1,
			itemData: 'first',
		});

		const unassignedEvents: string[][] = [];
		const assignmentEvents: { fieldId: string; text: string }[] = [];
		component.unassignedChange.subscribe((e) => unassignedEvents.push(e));
		component.assignmentChange.subscribe((e) => assignmentEvents.push(e));

		component.onPoolDropped(evt);

		expect(unassignedEvents[0]).toEqual(['second', 'first']);
		expect(assignmentEvents.length).toBe(0);
	});

	it('liveAnnouncer.announce fires on every drop completion (M3 a11y)', () => {
		const { card, bundle } = setupFour();
		const c = bundle.component;

		c.onFieldDropped(
			makeDropEvent({
				previousContainerId: `field-${card.id}-headline`,
				containerId: `field-${card.id}-subhead`,
				previousIndex: 0,
				currentIndex: 0,
				itemData: card.assignments.headline,
			}),
			'subhead',
		);

		c.onPoolDropped(
			makeDropEvent({
				previousContainerId: `field-${card.id}-subhead`,
				containerId: `pool-${card.id}`,
				previousIndex: 0,
				currentIndex: 0,
				itemData: card.assignments.headline,
			}),
		);

		expect(bundle.announcer.messages.length).toBe(2);
		expect(bundle.announcer.messages[0]).toContain('subhead');
		expect(bundle.announcer.messages[1]).toContain('Unassigned');
	});
});

// ---------------------------------------------------------------------
// AE6 — drag scoping: card 1's connected IDs do not include card 2's
// ---------------------------------------------------------------------

describe('TextCounterImageCard — drag scoping (R18 / AE6)', () => {
	it('connectedListIds only includes within-card list IDs', () => {
		const tpl = makeTemplate([
			makeField('headline', 'headline'),
			makeField('body', 'body'),
		]);
		const card = makeCard({ id: 'CARD-1' });
		const { component } = makeFixture({ card, templates: [tpl] });

		const ids = component.connectedListIds();
		expect(ids).toContain('pool-CARD-1');
		expect(ids).toContain('field-CARD-1-headline');
		expect(ids).toContain('field-CARD-1-body');
		// And critically — no ID from a different cardId.
		expect(ids.every((id) => id.includes('CARD-1'))).toBe(true);
	});

	it('handler returns when a drop event is dispatched from a different card', () => {
		const tpl = makeTemplate([makeField('headline', 'headline')]);
		const card = makeCard({
			id: 'CARD-A',
			assignments: { headline: 'HELLO' },
		});
		const { component } = makeFixture({ card, templates: [tpl] });

		// Drop arriving from a list ID that belongs to a DIFFERENT card
		// (`field-CARD-B-headline`). Even if some upstream wiring let
		// such an event reach us, the field-id parsing returns null and
		// the source field is not cleared.
		const evt = makeDropEvent({
			previousContainerId: 'field-CARD-B-headline',
			containerId: `pool-${card.id}`,
			previousIndex: 0,
			currentIndex: 0,
			itemData: 'CROSS',
		});

		const unassignedEvents: string[][] = [];
		const assignmentEvents: { fieldId: string; text: string }[] = [];
		component.unassignedChange.subscribe((e) => unassignedEvents.push(e));
		component.assignmentChange.subscribe((e) => assignmentEvents.push(e));

		component.onPoolDropped(evt);

		// No assignment cleared (because we can't resolve the source
		// field within this card), and no pool update either.
		expect(assignmentEvents.length).toBe(0);
		expect(unassignedEvents.length).toBe(0);
	});
});

// ---------------------------------------------------------------------
// AE5 — inline edit updates counts and validation
// ---------------------------------------------------------------------

describe('TextCounterImageCard — inline edit (AE5)', () => {
	it('emits assignmentChange when the field text is edited', () => {
		const tpl = makeTemplate([
			makeField('cta', 'cta', [{ type: 'maxCharacters', value: 25 }]),
		]);
		const card = makeCard({
			assignments: { cta: 'V1sit example.c0m' },
		});
		const { component } = makeFixture({ card, templates: [tpl] });

		const events: { fieldId: string; text: string }[] = [];
		component.assignmentChange.subscribe((e) => events.push(e));

		component.onFieldTextChange('cta', 'Visit example.com');
		expect(events).toEqual([{ fieldId: 'cta', text: 'Visit example.com' }]);
	});

	it('rule evaluation reflects the current text on the field row', () => {
		const tpl = makeTemplate([
			makeField('headline', 'headline', [
				{ type: 'maxCharacters', value: 5 },
			]),
		]);
		const card = makeCard({
			assignments: { headline: 'too long for the rule' },
		});
		const { component } = makeFixture({ card, templates: [tpl] });

		const row = component.fieldRows()[0];
		expect(row.failed.length).toBe(1);
		expect(row.failed[0].rule.type).toBe('maxCharacters');
	});
});

// ---------------------------------------------------------------------
// R21 — empty-field neutrality / min-rule failure
// ---------------------------------------------------------------------

describe('TextCounterImageCard — empty-field rule semantics (R21)', () => {
	it('an empty field with only maxCharacters renders neutral (no failed rules)', () => {
		const tpl = makeTemplate([
			makeField('cta', 'cta', [{ type: 'maxCharacters', value: 25 }]),
		]);
		const card = makeCard({ assignments: { cta: '' } });
		const { component } = makeFixture({ card, templates: [tpl] });

		const row = component.fieldRows()[0];
		expect(row.text).toBe('');
		expect(row.failed.length).toBe(0);
	});

	it('an empty field with minCharacters: 5 fails immediately', () => {
		const tpl = makeTemplate([
			makeField('headline', 'headline', [
				{ type: 'minCharacters', value: 5 },
			]),
		]);
		const card = makeCard({ assignments: { headline: '' } });
		const { component } = makeFixture({ card, templates: [tpl] });

		const row = component.fieldRows()[0];
		expect(row.failed.length).toBe(1);
		expect(row.failed[0].rule.type).toBe('minCharacters');
	});
});

// ---------------------------------------------------------------------
// Settings change re-rolls counts
// ---------------------------------------------------------------------

describe('TextCounterImageCard — settings reactivity', () => {
	it('re-evaluates field rule pass/fail when settings change', () => {
		const tpl = makeTemplate([
			makeField('headline', 'headline', [
				{ type: 'maxCharacters', value: 10 },
			]),
		]);
		const card = makeCard({
			assignments: { headline: 'hello world' }, // 11 chars w/ whitespace
		});
		const { fixture, component } = makeFixture({
			card,
			templates: [tpl],
		});

		expect(component.fieldRows()[0].failed.length).toBe(1);

		fixture.componentRef.setInput('settings', {
			...freshSettings(),
			countWhitespaceAsCharacter: false,
		});
		fixture.detectChanges();

		// Now characters = 10 (whitespace excluded) — passes the rule.
		expect(component.fieldRows()[0].failed.length).toBe(0);
	});
});

// ---------------------------------------------------------------------
// Keyboard menu fallback (M3)
// ---------------------------------------------------------------------

describe('TextCounterImageCard — keyboard menu fallback', () => {
	it('field menu excludes the current field and includes Unassigned', () => {
		const tpl = makeTemplate([
			makeField('a', 'A'),
			makeField('b', 'B'),
			makeField('c', 'C'),
		]);
		const card = makeCard({
			assignments: { a: 'aaa', b: 'bbb', c: 'ccc' },
		});
		const { component } = makeFixture({ card, templates: [tpl] });

		const labels = component.keyboardMenuForField('a').map((i) => i.label);
		expect(labels).toContain('Move to B');
		expect(labels).toContain('Move to C');
		expect(labels).toContain('Move to Unassigned');
		expect(labels.find((l) => l === 'Move to A')).toBeUndefined();
	});

	it('pool entry menu lists every field', () => {
		const tpl = makeTemplate([makeField('a', 'A'), makeField('b', 'B')]);
		const card = makeCard({
			assignments: {},
			unassigned: ['orphan'],
		});
		const { component } = makeFixture({ card, templates: [tpl] });

		const labels = component
			.keyboardMenuForPoolEntry(0)
			.map((i) => i.label);
		expect(labels).toEqual(['Move to A', 'Move to B']);
	});

	it('keyboard move from field to pool clears the field and pushes to pool', () => {
		const tpl = makeTemplate([makeField('a', 'A'), makeField('b', 'B')]);
		const card = makeCard({
			assignments: { a: 'first', b: 'second' },
			unassigned: [],
		});
		const { component } = makeFixture({ card, templates: [tpl] });

		const assignmentEvents: { fieldId: string; text: string }[] = [];
		const unassignedEvents: string[][] = [];
		component.assignmentChange.subscribe((e) => assignmentEvents.push(e));
		component.unassignedChange.subscribe((e) => unassignedEvents.push(e));

		component.moveChunkByKeyboard(
			{ kind: 'field', fieldId: 'a' },
			{ kind: 'pool' },
		);

		expect(unassignedEvents).toEqual([['first']]);
		expect(assignmentEvents).toEqual([{ fieldId: 'a', text: '' }]);
	});
});
