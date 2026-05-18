/**
 * Per-image card for the image + template tab.
 *
 * Renders one image's:
 *   - Thumbnail + remove control + filename + status tag
 *   - Template picker (delegates to `TextCounterTemplatePickerComponent`)
 *   - Field list — one row per template field, each a `CdkDropList`
 *     bound to the field's text. Rows render inline-editable text plus
 *     a pass/fail indicator driven by U7's `evaluateRules`.
 *   - Unassigned pool — a `CdkDropList` rendering AI-extracted chunks
 *     that didn't map cleanly to a field. Pool chunks show character /
 *     word counts (R20).
 *
 * Drag scoping (R18 / AE6):
 *   - Every `CdkDropList` (per field + pool) is assigned an ID scoped to
 *     this card's instance (`field-{cardId}-{fieldId}`, `pool-{cardId}`).
 *   - `cdkDropListConnectedTo` for each list lists ONLY within-card IDs
 *     so drops from a different card's lists are rejected by the CDK.
 *
 * Destination-text replacement (R16 / DQ1):
 *   - When the user drops a chunk onto a field that already has text,
 *     the existing text is moved to the unassigned pool rather than
 *     silently discarded.
 *
 * Accessibility (M3):
 *   - `LiveAnnouncer.announce` fires on every drop with a message like
 *     "Moved 'V1sit example.com' to disclaimer".
 *   - Each chunk also exposes a `p-menu` keyboard alternative with
 *     "Move to: …" entries, so the drag/drop behavior is reachable
 *     without a pointer.
 *
 * Validation (M5 / R21):
 *   - Each field renders a `evaluateRules(text, field.rules, settings)`
 *     summary. Empty fields render neutrally unless a min-bearing rule
 *     fails — that's the natural output of the evaluator for an empty
 *     string, no special-case needed.
 *
 * Persistence: NONE. Card state lives entirely in the parent
 * orchestrator's signal — the card holds no its-own state across
 * teardown. Refresh clears everything (AE9).
 */
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	output,
	signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';

import { PrimeNgModule } from '../../../../shared/primeng.module';
import type { RuleResult } from '../../models/rule.types';
import type { Template, TemplateField } from '../../models/template.types';
import type { TextCounterSettings } from '../../models/text-counter.types';
import { evaluateRules } from '../../services/text-counter-validation.util';
import { computeStats } from '../../services/text-counter.util';
import { TextCounterTemplatePickerComponent } from '../text-counter-template-picker/text-counter-template-picker.component';

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export type ImageCardStatus = 'pending' | 'extracting' | 'done' | 'error';

/**
 * One image card's state, owned by the orchestrator.
 *
 * `assignments` maps field id → assigned text. Missing fields render as
 * empty (the natural evaluator behavior covers the empty case).
 *
 * `unassigned` is the ordered pool of chunks that didn't map to a
 * field.
 */
export interface ImageCardState {
	readonly id: string;
	readonly file: File;
	readonly previewUrl: string;
	templateId: string | null;
	status: ImageCardStatus;
	assignments: Record<string, string>;
	unassigned: string[];
	error: string | null;
}

/**
 * View-model row for a template field — pre-computed for the template
 * so the template doesn't call helpers in attribute bindings.
 */
interface FieldRow {
	field: TemplateField;
	dropListId: string;
	text: string;
	rules: RuleResult[];
	failed: RuleResult[];
	hasRules: boolean;
	tooltipText: string;
	stats: { characters: number; words: number };
	items: string[]; // single-item array so CdkDropList has a stable reference
}

/**
 * View-model entry for a chunk in the unassigned pool.
 */
interface PoolEntry {
	text: string;
	index: number;
	stats: { characters: number; words: number };
}

// ---------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------

@Component({
	selector: 'app-text-counter-image-card',
	standalone: true,
	templateUrl: './text-counter-image-card.component.html',
	styleUrls: ['./text-counter-image-card.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		FormsModule,
		CdkDropList,
		CdkDrag,
		MenuModule,
		TextareaModule,
		TooltipModule,
		PrimeNgModule,
		TextCounterTemplatePickerComponent,
	],
})
export class TextCounterImageCardComponent {
	// -----------------------------------------------------------------
	// Inputs / outputs
	// -----------------------------------------------------------------

	readonly card = input.required<ImageCardState>();
	readonly templates = input.required<Template[]>();
	readonly orgId = input.required<string>();
	readonly settings = input.required<TextCounterSettings>();

	readonly templateChange = output<string | null>();
	readonly assignmentChange = output<{ fieldId: string; text: string }>();
	readonly unassignedChange = output<string[]>();
	readonly remove = output<void>();
	readonly manageTemplatesClicked = output<void>();
	readonly retryRequested = output<void>();

	// -----------------------------------------------------------------
	// Internal UI state (not persisted)
	// -----------------------------------------------------------------

	/**
	 * Toggled by `cdkDragStarted` / `cdkDragEnded` — used to highlight
	 * valid drop targets within this card while a drag is active.
	 */
	readonly dragging = signal<boolean>(false);

	private readonly announcer = inject(LiveAnnouncer);

	// -----------------------------------------------------------------
	// Computed selectors
	// -----------------------------------------------------------------

	readonly selectedTemplate = computed<Template | null>(() => {
		const id = this.card().templateId;
		if (!id) return null;
		return this.templates().find((t) => t.id === id) ?? null;
	});

	/**
	 * The current set of drop-list IDs that any list in this card may
	 * accept drops FROM. Includes the pool plus every field — but never
	 * any IDs from other cards (R18 / AE6).
	 */
	readonly connectedListIds = computed<string[]>(() => {
		const cardId = this.card().id;
		const tpl = this.selectedTemplate();
		const ids: string[] = [this.poolListId];
		if (tpl) {
			for (const f of tpl.fields) {
				ids.push(`field-${cardId}-${f.id}`);
			}
		}
		return ids;
	});

	readonly fieldRows = computed<FieldRow[]>(() => {
		const tpl = this.selectedTemplate();
		if (!tpl) return [];
		const settings = this.settings();
		const assignments = this.card().assignments;
		const cardId = this.card().id;
		return tpl.fields.map((field) => {
			const text = assignments[field.id] ?? '';
			const rules = evaluateRules(text, field.rules, settings);
			const failed = rules.filter((r) => !r.pass);
			const tooltipText = buildFailureTooltip(failed);
			const stats = computeStats(text, settings);
			return {
				field,
				dropListId: `field-${cardId}-${field.id}`,
				text,
				rules,
				failed,
				hasRules: field.rules.length > 0,
				tooltipText,
				stats: { characters: stats.characters, words: stats.words },
				items: [text],
			};
		});
	});

	readonly poolEntries = computed<PoolEntry[]>(() => {
		const settings = this.settings();
		return this.card().unassigned.map((text, index) => {
			const stats = computeStats(text, settings);
			return {
				text,
				index,
				stats: { characters: stats.characters, words: stats.words },
			};
		});
	});

	get poolListId(): string {
		return `pool-${this.card().id}`;
	}

	get isReadyForExtraction(): boolean {
		const card = this.card();
		return card.templateId !== null && card.status === 'pending';
	}

	// -----------------------------------------------------------------
	// Template-picker glue
	// -----------------------------------------------------------------

	onTemplateChange(id: string | null): void {
		this.templateChange.emit(id);
	}

	onManageTemplatesClicked(): void {
		this.manageTemplatesClicked.emit();
	}

	// -----------------------------------------------------------------
	// Inline edit
	// -----------------------------------------------------------------

	onFieldTextChange(fieldId: string, value: string | null | undefined): void {
		const text = value ?? '';
		this.assignmentChange.emit({ fieldId, text });
	}

	// -----------------------------------------------------------------
	// Drag / drop
	// -----------------------------------------------------------------

	onDragStarted(): void {
		this.dragging.set(true);
	}

	onDragEnded(): void {
		this.dragging.set(false);
	}

	/**
	 * Pool → pool drop. Reordering within the pool. (Pool → field and
	 * field → pool / field → field are handled by `onFieldDropped` /
	 * `onPoolDropped`; we keep these handlers separate to keep their
	 * semantics distinct.)
	 */
	onPoolDropped(event: CdkDragDrop<string[]>): void {
		const previousId = event.previousContainer.id;
		const currentId = event.container.id;
		const movedText = this.readDraggedText(event);

		if (previousId === currentId) {
			// Reorder inside the pool.
			const next = [...this.card().unassigned];
			const [item] = next.splice(event.previousIndex, 1);
			next.splice(event.currentIndex, 0, item);
			this.unassignedChange.emit(next);
			this.announceMove(movedText, 'Unassigned pool');
			return;
		}

		// Came from a field — empty that field, add the text to the pool.
		const fromFieldId = this.fieldIdFromListId(previousId);
		if (fromFieldId === null) return;
		const nextPool = [...this.card().unassigned];
		nextPool.splice(event.currentIndex, 0, movedText);
		this.unassignedChange.emit(nextPool);
		this.assignmentChange.emit({ fieldId: fromFieldId, text: '' });
		this.announceMove(movedText, 'Unassigned pool');
	}

	/**
	 * Drop landed on a field. Two cases:
	 *   - Source is the pool — remove from pool, set the field text.
	 *   - Source is another field — clear the source field, set this one.
	 * In both, if the target field already had text, that text moves to
	 * the pool (R16 / DQ1 — no silent overwrite).
	 */
	onFieldDropped(event: CdkDragDrop<string[]>, targetFieldId: string): void {
		const previousId = event.previousContainer.id;
		const currentId = event.container.id;
		if (previousId === currentId) {
			// Drop onto the same field — no-op.
			return;
		}

		const movedText = this.readDraggedText(event);
		const targetExistingText = this.card().assignments[targetFieldId] ?? '';

		// 1. Place the dragged text into the target field.
		this.assignmentChange.emit({
			fieldId: targetFieldId,
			text: movedText,
		});

		// 2. Clear the source.
		if (previousId === this.poolListId) {
			// Pool → field: drop the chunk from the pool.
			const nextPool = [...this.card().unassigned];
			nextPool.splice(event.previousIndex, 1);
			// 3. If the target had pre-existing text, displace it to the pool.
			if (targetExistingText.length > 0) {
				nextPool.push(targetExistingText);
			}
			this.unassignedChange.emit(nextPool);
		} else {
			// Field → field: clear the source field.
			const fromFieldId = this.fieldIdFromListId(previousId);
			if (fromFieldId !== null) {
				this.assignmentChange.emit({
					fieldId: fromFieldId,
					text: '',
				});
			}
			// And if the target had pre-existing text, push it to the pool.
			if (targetExistingText.length > 0) {
				const nextPool = [
					...this.card().unassigned,
					targetExistingText,
				];
				this.unassignedChange.emit(nextPool);
			}
		}

		const targetLabel = this.labelForField(targetFieldId) ?? 'field';
		this.announceMove(movedText, targetLabel);
	}

	/**
	 * Keyboard alternative — `p-menu` items dispatch this to perform the
	 * same effects a drag would. `source` is either the pool index or a
	 * field id; `target` is `'pool'` or a field id.
	 */
	moveChunkByKeyboard(
		source:
			| { kind: 'pool'; index: number }
			| { kind: 'field'; fieldId: string },
		target: { kind: 'pool' } | { kind: 'field'; fieldId: string },
	): void {
		const text = this.readSourceText(source);
		if (text === null) return;

		if (target.kind === 'pool') {
			// Pool → pool no-op.
			if (source.kind === 'pool') return;
			const nextPool = [...this.card().unassigned, text];
			this.unassignedChange.emit(nextPool);
			this.assignmentChange.emit({ fieldId: source.fieldId, text: '' });
			this.announceMove(text, 'Unassigned pool');
			return;
		}

		// target.kind === 'field'
		const targetFieldId = target.fieldId;
		if (source.kind === 'field' && source.fieldId === targetFieldId) {
			return;
		}

		const targetExistingText = this.card().assignments[targetFieldId] ?? '';
		this.assignmentChange.emit({ fieldId: targetFieldId, text });

		if (source.kind === 'pool') {
			const nextPool = [...this.card().unassigned];
			nextPool.splice(source.index, 1);
			if (targetExistingText.length > 0) {
				nextPool.push(targetExistingText);
			}
			this.unassignedChange.emit(nextPool);
		} else {
			this.assignmentChange.emit({
				fieldId: source.fieldId,
				text: '',
			});
			if (targetExistingText.length > 0) {
				const nextPool = [
					...this.card().unassigned,
					targetExistingText,
				];
				this.unassignedChange.emit(nextPool);
			}
		}

		this.announceMove(text, this.labelForField(targetFieldId) ?? 'field');
	}

	/**
	 * Menu items shown on the keyboard fallback "Move to" menu for a
	 * chunk currently in a field.
	 */
	keyboardMenuForField(fieldId: string): MenuItem[] {
		const tpl = this.selectedTemplate();
		const items: MenuItem[] = [];
		if (tpl) {
			for (const f of tpl.fields) {
				if (f.id === fieldId) continue;
				items.push({
					label: `Move to ${f.label}`,
					command: () =>
						this.moveChunkByKeyboard(
							{ kind: 'field', fieldId },
							{ kind: 'field', fieldId: f.id },
						),
				});
			}
		}
		items.push({
			label: 'Move to Unassigned',
			command: () =>
				this.moveChunkByKeyboard(
					{ kind: 'field', fieldId },
					{ kind: 'pool' },
				),
		});
		return items;
	}

	/**
	 * Menu items shown on the keyboard fallback "Move to" menu for a
	 * chunk currently in the unassigned pool.
	 */
	keyboardMenuForPoolEntry(index: number): MenuItem[] {
		const tpl = this.selectedTemplate();
		if (!tpl) return [];
		return tpl.fields.map((f) => ({
			label: `Move to ${f.label}`,
			command: () =>
				this.moveChunkByKeyboard(
					{ kind: 'pool', index },
					{ kind: 'field', fieldId: f.id },
				),
		}));
	}

	// -----------------------------------------------------------------
	// Card-level controls
	// -----------------------------------------------------------------

	onRemoveClicked(): void {
		this.remove.emit();
	}

	onRetryClicked(): void {
		this.retryRequested.emit();
	}

	// -----------------------------------------------------------------
	// Track-by helpers
	// -----------------------------------------------------------------

	trackFieldRow(_: number, row: FieldRow): string {
		return row.field.id;
	}

	trackPoolEntry(_: number, entry: PoolEntry): string {
		// Tag with index too — duplicate texts in the pool would otherwise
		// collide on this trackBy.
		return `${entry.index}::${entry.text}`;
	}

	// -----------------------------------------------------------------
	// Internals
	// -----------------------------------------------------------------

	private readDraggedText(
		event:
			| CdkDragDrop<unknown>
			| CdkDragDrop<string[]>
			| CdkDragDrop<readonly string[]>,
	): string {
		// We attach the dragged chunk's text to cdkDrag's data via
		// `[cdkDragData]`. The CDK exposes it as `event.item.data`.
		const data = (event.item as { data?: unknown }).data;
		if (typeof data === 'string') return data;
		return '';
	}

	private readSourceText(
		source:
			| { kind: 'pool'; index: number }
			| { kind: 'field'; fieldId: string },
	): string | null {
		if (source.kind === 'pool') {
			const pool = this.card().unassigned;
			if (source.index < 0 || source.index >= pool.length) return null;
			return pool[source.index];
		}
		return this.card().assignments[source.fieldId] ?? null;
	}

	private fieldIdFromListId(listId: string): string | null {
		// `field-{cardId}-{fieldId}` — cardId is the leading uuid-like
		// portion; we split on the FIRST occurrence after the prefix.
		const cardId = this.card().id;
		const prefix = `field-${cardId}-`;
		if (!listId.startsWith(prefix)) return null;
		return listId.slice(prefix.length);
	}

	private labelForField(fieldId: string): string | null {
		const tpl = this.selectedTemplate();
		if (!tpl) return null;
		const f = tpl.fields.find((x) => x.id === fieldId);
		return f?.label ?? null;
	}

	private announceMove(text: string, destinationLabel: string): void {
		const preview = previewSnippet(text);
		const message = preview
			? `Moved "${preview}" to ${destinationLabel}`
			: `Moved chunk to ${destinationLabel}`;
		this.announcer.announce(message, 'polite');
	}
}

// ---------------------------------------------------------------------
// Module-local helpers (exported for the spec)
// ---------------------------------------------------------------------

const PREVIEW_LENGTH = 40;

export function previewSnippet(text: string): string {
	if (!text) return '';
	const collapsed = text.replace(/\s+/g, ' ').trim();
	if (collapsed.length <= PREVIEW_LENGTH) return collapsed;
	return `${collapsed.slice(0, PREVIEW_LENGTH - 1)}…`;
}

export function buildFailureTooltip(failed: RuleResult[]): string {
	if (failed.length === 0) return '';
	return failed
		.map((r) => {
			switch (r.rule.type) {
				case 'maxCharacters':
					return `Max ${r.rule.value} chars${r.detail ? ` (${r.detail})` : ''}`;
				case 'maxWords':
					return `Max ${r.rule.value} words${r.detail ? ` (${r.detail})` : ''}`;
				case 'minCharacters':
					return `Min ${r.rule.value} chars${r.detail ? ` (${r.detail})` : ''}`;
				case 'minWords':
					return `Min ${r.rule.value} words${r.detail ? ` (${r.detail})` : ''}`;
				case 'singleLine':
					return 'Must be a single line';
				case 'forbiddenWords':
					return r.detail
						? `Forbidden words ${r.detail}`
						: 'Contains forbidden words';
			}
		})
		.join(' · ');
}
