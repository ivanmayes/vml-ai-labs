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
	inject,
	signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FileUploadModule } from 'primeng/fileupload';
import { Subscription } from 'rxjs';

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
import {
	ACCEPT_MIMES,
	MAX_UPLOAD_BYTES,
	createImagePreviewUrl,
	extractErrorMessage,
	nextId,
	revokeImagePreviewUrl,
} from '../../services/text-counter-shared.util';
import { TextCounterConsentBannerComponent } from '../text-counter-consent-banner/text-counter-consent-banner.component';
import {
	ImageCardState,
	TextCounterImageCardComponent,
} from '../text-counter-image-card/text-counter-image-card.component';
import {
	EditorMode,
	TextCounterTemplateEditorComponent,
} from '../text-counter-template-editor/text-counter-template-editor.component';

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

	// Active extraction subscriptions, keyed by cardId. Tracked so we can
	// abort an in-flight request when the user removes a card or switches
	// the card to a different template before the result arrives.
	private readonly extractionSubs = new Map<string, Subscription>();

	ngOnInit(): void {
		this.refreshTemplates();
	}

	ngOnDestroy(): void {
		for (const sub of this.extractionSubs.values()) {
			sub.unsubscribe();
		}
		this.extractionSubs.clear();
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
					this.templatesError.set(
						extractErrorMessage(err, {
							fallback: 'Failed to load templates.',
						}),
					);
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
			previewUrl: createImagePreviewUrl(file),
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
		// Cancel any in-flight extraction for this card — the user is
		// either clearing the template or switching to a different one, so
		// the pending result is no longer relevant.
		const existing = this.extractionSubs.get(cardId);
		if (existing) {
			existing.unsubscribe();
			this.extractionSubs.delete(cardId);
		}

		this.imageCards.update((list) =>
			list.map((card) =>
				card.id !== cardId
					? card
					: {
							...card,
							templateId,
							// Whether the user picked a new template or cleared
							// it entirely, the card returns to "pending". When a
							// templateId is set we fire extraction below.
							status: 'pending',
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
			// Kick off extraction synchronously now that we know which
			// template applies. (Previously a constructor effect() iterated
			// every card on every signal mutation — replaced with this
			// direct call.)
			this.runExtraction(cardId);
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
		// Cancel any in-flight extraction so we don't pay the AI cost on a
		// card the user just discarded.
		const sub = this.extractionSubs.get(cardId);
		if (sub) {
			sub.unsubscribe();
			this.extractionSubs.delete(cardId);
		}
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
		this.runExtraction(cardId);
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

	onEditorSaved(template: Template): void {
		// Merge the saved template into the local list in place rather
		// than re-fetching from the server. Avoids a redundant GET on
		// every dialog close.
		this.templates.update((list) => {
			const idx = list.findIndex((t) => t.id === template.id);
			if (idx === -1) return [...list, template];
			const next = [...list];
			next[idx] = template;
			return next;
		});
		this.editorVisible.set(false);
	}

	onEditorDeleted(id: string): void {
		this.templates.update((list) => list.filter((t) => t.id !== id));
		// For any card currently using the deleted template, flag it so
		// the per-card UI can prompt the user to pick a different one.
		this.deletedTemplateForCard.update((map) => {
			const next = { ...map };
			for (const card of this.imageCards()) {
				if (card.templateId === id) next[card.id] = true;
			}
			return next;
		});
		this.editorVisible.set(false);
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
		const tpl =
			this.templates().find((t) => t.id === card.templateId) ?? null;

		// Cancel any previous in-flight extraction for this card before
		// starting a new one (retry or rapid template switch).
		const previous = this.extractionSubs.get(cardId);
		if (previous) {
			previous.unsubscribe();
			this.extractionSubs.delete(cardId);
		}

		// Move to extracting.
		this.imageCards.update((list) =>
			list.map((c) =>
				c.id !== cardId
					? c
					: { ...c, status: 'extracting', error: null },
			),
		);

		const sub = this.extractionService
			.extract(this.orgId, card.file, 'template', card.templateId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (result) => {
					const tplResult = narrowTemplate(result);
					if (!tplResult) {
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
						this.extractionSubs.delete(cardId);
						this.cdr.markForCheck();
						return;
					}
					this.applyTemplateResult(cardId, tplResult, tpl);
					this.extractionSubs.delete(cardId);
					this.cdr.markForCheck();
				},
				error: (err: unknown) => {
					const status = (err as { status?: number })?.status ?? 0;
					const message = extractErrorMessage(err, {
						override404:
							'This template no longer exists. Pick another from the list.',
						fallback: 'Extraction failed. Try again.',
					});
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
					this.extractionSubs.delete(cardId);
					this.cdr.markForCheck();
				},
			});

		this.extractionSubs.set(cardId, sub);
	}

	private applyTemplateResult(
		cardId: string,
		result: TemplateExtractionResult,
		tpl: Template | null,
	): void {
		if (!tpl) {
			// The template disappeared between the extraction request and
			// the response. Surface as a deleted-template error rather
			// than silently dropping the result.
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

		// The API contract guarantees that `matches` is the same length as
		// `template.fields` and is ordered by field position (see
		// extraction.service.normalizeTemplateResponse on the API). Any
		// stray AI labels are already routed to `unassigned`. We can
		// therefore zip directly without any find-by-label / leftover
		// shuffle on the client.
		const assignments: Record<string, string> = {};
		for (let i = 0; i < tpl.fields.length; i++) {
			assignments[tpl.fields[i].id] = result.matches[i]?.text ?? '';
		}

		this.imageCards.update((list) =>
			list.map((c) =>
				c.id !== cardId
					? c
					: {
							...c,
							status: 'done',
							error: null,
							assignments,
							unassigned: [...result.unassigned],
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

	private releasePreview(card: ImageCardState): void {
		if (!card.previewUrl) return;
		revokeImagePreviewUrl(card.previewUrl);
	}
}
