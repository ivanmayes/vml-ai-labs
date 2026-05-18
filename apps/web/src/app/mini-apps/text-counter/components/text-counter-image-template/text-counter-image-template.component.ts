/**
 * Image + template tab orchestrator.
 *
 * Owns:
 *   - The list of image card states (`imageCards`).
 *   - The list of saved templates (`templates`), fetched once on mount
 *     and re-fetched whenever the template editor saves or deletes.
 *   - The shared template-editor dialog state (`editorVisible`,
 *     `editorMode`, `editorTarget`). One dialog instance, opened from
 *     either the consent-time empty state, any per-card "Manage
 *     templates" link, or by any image card's first-run picker.
 *
 * Drives:
 *   - File-upload multi-select via `p-fileUpload`. Each file becomes a
 *     pending card with `templateId = null`. The card's template picker
 *     drives `extractionRequested` once a template is chosen, at which
 *     point this component fires the extraction call.
 *   - The consent banner (M11) — mounted only after at least one image
 *     has been uploaded.
 *
 * Does NOT:
 *   - Persist anything. Refreshing the page clears every card,
 *     assignment, and pool entry — only the templates (server-side)
 *     survive (AE9).
 *   - Render drag UI directly. That lives in the card component so we
 *     can scope `cdkDropListConnectedTo` per card (R18 / AE6).
 */
import { CommonModule } from '@angular/common';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	DestroyRef,
	OnDestroy,
	OnInit,
	computed,
	effect,
	inject,
	signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FileUploadModule } from 'primeng/fileupload';

import { environment } from '../../../../../environments/environment';
import { PrimeNgModule } from '../../../../shared/primeng.module';
import type {
	ExtractionResult,
	TemplateExtractionResult,
} from '../../models/extraction.types';
import { isTemplateExtractionResult } from '../../models/extraction.types';
import type { Template } from '../../models/template.types';
import type { TextCounterSettings } from '../../models/text-counter.types';
import { TextCounterExtractionService } from '../../services/text-counter-extraction.service';
import { TextCounterTemplatesService } from '../../services/text-counter-templates.service';
import { loadSettings } from '../../services/text-counter-settings.util';
import { TextCounterConsentBannerComponent } from '../text-counter-consent-banner/text-counter-consent-banner.component';
import {
	ImageCardState,
	TextCounterImageCardComponent,
} from '../text-counter-image-card/text-counter-image-card.component';
import {
	EditorMode,
	TextCounterTemplateEditorComponent,
} from '../text-counter-template-editor/text-counter-template-editor.component';

const ACCEPT_MIMES = 'image/png,image/jpeg,image/webp,image/gif';
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function nextId(): string {
	if (
		typeof crypto !== 'undefined' &&
		typeof crypto.randomUUID === 'function'
	) {
		return crypto.randomUUID();
	}
	return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function narrowTemplate(
	result: ExtractionResult,
): TemplateExtractionResult | null {
	return isTemplateExtractionResult(result) ? result : null;
}

@Component({
	selector: 'app-text-counter-image-template',
	standalone: true,
	templateUrl: './text-counter-image-template.component.html',
	styleUrls: ['./text-counter-image-template.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		FormsModule,
		FileUploadModule,
		PrimeNgModule,
		TextCounterConsentBannerComponent,
		TextCounterImageCardComponent,
		TextCounterTemplateEditorComponent,
	],
})
export class TextCounterImageTemplateComponent implements OnInit, OnDestroy {
	private readonly destroyRef = inject(DestroyRef);
	private readonly extractionService = inject(TextCounterExtractionService);
	private readonly templatesService = inject(TextCounterTemplatesService);
	private readonly cdr = inject(ChangeDetectorRef);

	readonly orgId = environment.organizationId;
	readonly acceptMimes = ACCEPT_MIMES;
	readonly maxUploadBytes = MAX_UPLOAD_BYTES;
	readonly maxUploadMb = MAX_UPLOAD_BYTES / 1024 / 1024;

	readonly templates = signal<Template[]>([]);
	readonly templatesLoaded = signal<boolean>(false);
	readonly templatesError = signal<string | null>(null);

	readonly imageCards = signal<ImageCardState[]>([]);
	readonly settings = signal<TextCounterSettings>(loadSettings());

	// Per-card 404 banner: surfaces when a card's selected template was
	// deleted on the server and re-extraction returns a 404.
	readonly deletedTemplateForCard = signal<Record<string, true>>({});

	// Template editor dialog state.
	readonly editorVisible = signal<boolean>(false);
	readonly editorMode = signal<EditorMode>('create');
	readonly editorTarget = signal<Template | null>(null);

	readonly hasAnyCards = computed(() => this.imageCards().length > 0);

	constructor() {
		// Auto-trigger extraction whenever a card's template is selected
		// for the first time. We watch `imageCards` and kick off the
		// extraction call for any entry in the "pending" status that now
		// has a template id. This keeps the orchestration logic in one
		// place rather than threading it through the card component's
		// outputs.
		effect(() => {
			const cards = this.imageCards();
			for (const card of cards) {
				if (card.templateId && card.status === 'pending') {
					this.runExtraction(card.id);
				}
			}
		});
	}

	ngOnInit(): void {
		this.refreshTemplates();
	}

	ngOnDestroy(): void {
		for (const card of this.imageCards()) {
			this.releasePreview(card);
		}
	}

	// -----------------------------------------------------------------
	// Templates
	// -----------------------------------------------------------------

	refreshTemplates(): void {
		this.templatesService
			.list(this.orgId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (list) => {
					this.templates.set(list);
					this.templatesLoaded.set(true);
					this.templatesError.set(null);
					this.cdr.markForCheck();
				},
				error: (err: unknown) => {
					this.templatesLoaded.set(true);
					this.templatesError.set(extractErrorMessage(err));
					this.cdr.markForCheck();
				},
			});
	}

	// -----------------------------------------------------------------
	// Upload
	// -----------------------------------------------------------------

	onUpload(event: unknown): void {
		const files = (event as { files?: File[] })?.files ?? [];
		if (files.length === 0) return;
		const newCards: ImageCardState[] = files.map((file) => ({
			id: nextId(),
			file,
			previewUrl: this.createPreview(file),
			templateId: null,
			status: 'pending' as const,
			assignments: {},
			unassigned: [],
			error: null,
		}));
		this.imageCards.update((list) => [...list, ...newCards]);
	}

	// -----------------------------------------------------------------
	// Card-level event handlers
	// -----------------------------------------------------------------

	onTemplateChange(cardId: string, templateId: string | null): void {
		this.imageCards.update((list) =>
			list.map((card) =>
				card.id !== cardId
					? card
					: {
							...card,
							templateId,
							// Picking a (different) template resets assignments
							// + unassigned and re-runs extraction. Clearing the
							// template just resets the card to "pending without
							// template" — no extraction fires.
							status: templateId ? 'pending' : 'pending',
							assignments: {},
							unassigned: [],
							error: null,
						},
			),
		);
		// Clear the 404 banner if the user switched to a different template.
		if (templateId) {
			this.deletedTemplateForCard.update((map) => {
				if (!map[cardId]) return map;
				const next = { ...map };
				delete next[cardId];
				return next;
			});
		}
	}

	onAssignmentChange(
		cardId: string,
		change: { fieldId: string; text: string },
	): void {
		this.imageCards.update((list) =>
			list.map((card) =>
				card.id !== cardId
					? card
					: {
							...card,
							assignments: {
								...card.assignments,
								[change.fieldId]: change.text,
							},
						},
			),
		);
	}

	onUnassignedChange(cardId: string, next: string[]): void {
		this.imageCards.update((list) =>
			list.map((card) =>
				card.id !== cardId ? card : { ...card, unassigned: next },
			),
		);
	}

	onRemove(cardId: string): void {
		const card = this.imageCards().find((c) => c.id === cardId);
		if (card) this.releasePreview(card);
		this.imageCards.update((list) => list.filter((c) => c.id !== cardId));
		this.deletedTemplateForCard.update((map) => {
			if (!map[cardId]) return map;
			const next = { ...map };
			delete next[cardId];
			return next;
		});
	}

	onRetry(cardId: string): void {
		const card = this.imageCards().find((c) => c.id === cardId);
		if (!card || !card.templateId) return;
		this.imageCards.update((list) =>
			list.map((c) =>
				c.id !== cardId
					? c
					: {
							...c,
							status: 'pending',
							error: null,
							assignments: {},
							unassigned: [],
						},
			),
		);
		// The effect re-fires extraction because the card is now
		// pending + has a templateId.
	}

	openCreateTemplate(): void {
		this.editorMode.set('create');
		this.editorTarget.set(null);
		this.editorVisible.set(true);
	}

	onManageTemplatesClickedFromCard(): void {
		// Opens the editor in create mode. In V1 we surface the create
		// flow directly — the in-editor list/edit flow is a follow-up.
		this.openCreateTemplate();
	}

	onEditorSaved(_: Template): void {
		this.editorVisible.set(false);
		this.refreshTemplates();
	}

	onEditorDeleted(_id: string): void {
		this.editorVisible.set(false);
		this.refreshTemplates();
	}

	onEditorClosed(): void {
		this.editorVisible.set(false);
	}

	onEditorVisibleChange(value: boolean): void {
		this.editorVisible.set(value);
	}

	// -----------------------------------------------------------------
	// Extraction
	// -----------------------------------------------------------------

	private runExtraction(cardId: string): void {
		const card = this.imageCards().find((c) => c.id === cardId);
		if (!card || !card.templateId) return;
		// Move to extracting.
		this.imageCards.update((list) =>
			list.map((c) =>
				c.id !== cardId
					? c
					: { ...c, status: 'extracting', error: null },
			),
		);

		this.extractionService
			.extract(this.orgId, card.file, 'template', card.templateId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (result) => {
					const tpl = narrowTemplate(result);
					if (!tpl) {
						this.imageCards.update((list) =>
							list.map((c) =>
								c.id !== cardId
									? c
									: {
											...c,
											status: 'error',
											error: 'Unexpected general response for template extraction.',
										},
							),
						);
						this.cdr.markForCheck();
						return;
					}
					this.applyTemplateResult(cardId, tpl);
					this.cdr.markForCheck();
				},
				error: (err: unknown) => {
					const status = (err as { status?: number })?.status ?? 0;
					const message = extractErrorMessage(err);
					if (status === 404) {
						this.deletedTemplateForCard.update((map) => ({
							...map,
							[cardId]: true,
						}));
					}
					this.imageCards.update((list) =>
						list.map((c) =>
							c.id !== cardId
								? c
								: { ...c, status: 'error', error: message },
						),
					);
					this.cdr.markForCheck();
				},
			});
	}

	private applyTemplateResult(
		cardId: string,
		result: TemplateExtractionResult,
	): void {
		const card = this.imageCards().find((c) => c.id === cardId);
		if (!card) return;
		const tpl = this.templates().find((t) => t.id === card.templateId);
		if (!tpl) {
			// The template disappeared while we were extracting. Surface as
			// a deleted-template error rather than dropping the result.
			this.imageCards.update((list) =>
				list.map((c) =>
					c.id !== cardId
						? c
						: {
								...c,
								status: 'error',
								error: 'The template for this image is no longer available — pick another.',
							},
				),
			);
			this.deletedTemplateForCard.update((map) => ({
				...map,
				[cardId]: true,
			}));
			return;
		}

		const assignments: Record<string, string> = {};
		const remaining = [...result.matches];
		for (const f of tpl.fields) {
			const idx = remaining.findIndex((m) => m.label === f.label);
			if (idx >= 0) {
				const [m] = remaining.splice(idx, 1);
				assignments[f.id] = m.text;
			} else {
				assignments[f.id] = '';
			}
		}
		// Any leftover matches (labels the AI returned that don't map to
		// any field) join the unassigned pool — better than dropping
		// them silently.
		const leftoverFromMatches = remaining.map((m) => m.text);

		this.imageCards.update((list) =>
			list.map((c) =>
				c.id !== cardId
					? c
					: {
							...c,
							status: 'done',
							error: null,
							assignments,
							unassigned: [
								...result.unassigned,
								...leftoverFromMatches,
							],
						},
			),
		);
	}

	// -----------------------------------------------------------------
	// Track-by helpers
	// -----------------------------------------------------------------

	trackCard(_: number, card: ImageCardState): string {
		return card.id;
	}

	// -----------------------------------------------------------------
	// Internals
	// -----------------------------------------------------------------

	private createPreview(file: File): string {
		try {
			return URL.createObjectURL(file);
		} catch {
			return '';
		}
	}

	private releasePreview(card: ImageCardState): void {
		if (!card.previewUrl) return;
		try {
			URL.revokeObjectURL(card.previewUrl);
		} catch {
			/* no-op */
		}
	}
}

function extractErrorMessage(err: unknown): string {
	if (typeof err === 'object' && err !== null) {
		const e = err as {
			error?: { message?: string };
			message?: string;
			status?: number;
		};
		if (e.status === 404) {
			return 'This template no longer exists. Pick another from the list.';
		}
		if (e.error?.message) return e.error.message;
		if (e.message) return e.message;
	}
	return 'Extraction failed. Try again.';
}
