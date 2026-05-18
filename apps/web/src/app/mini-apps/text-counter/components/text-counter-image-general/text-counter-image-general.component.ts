import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	DestroyRef,
	OnDestroy,
	computed,
	inject,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FileUploadModule } from 'primeng/fileupload';
import { TextareaModule } from 'primeng/textarea';
import { Subscription } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import { PrimeNgModule } from '../../../../shared/primeng.module';
import type {
	ExtractionResult,
	GeneralExtractionResult,
} from '../../models/extraction.types';
import { isTemplateExtractionResult } from '../../models/extraction.types';
import type {
	TextCounterSettings,
	TextStats,
} from '../../models/text-counter.types';
import { loadSettings } from '../../services/text-counter-settings.util';
import {
	ACCEPT_MIMES,
	MAX_UPLOAD_BYTES,
	createImagePreviewUrl,
	extractErrorMessage,
	nextId,
	revokeImagePreviewUrl,
} from '../../services/text-counter-shared.util';
import { computeStats } from '../../services/text-counter.util';
import { TextCounterExtractionService } from '../../services/text-counter-extraction.service';
import {
	TextCounterConsentBannerComponent,
	hasAIConsent,
} from '../text-counter-consent-banner/text-counter-consent-banner.component';

/**
 * Per-image extraction state. Order of statuses:
 *   pending  -> extracting -> done | error
 *
 * `pending` is reserved for future use (e.g. queued uploads). The
 * current V1 flow goes straight to `extracting` on file accept.
 */
export type ImageStatus = 'pending' | 'extracting' | 'done' | 'error';

export interface ImageRow {
	readonly id: string;
	text: string;
}

export interface ImageEntry {
	readonly id: string;
	readonly file: File;
	readonly previewUrl: string;
	status: ImageStatus;
	rows: ImageRow[];
	error: string | null;
}

interface RowView {
	id: string;
	text: string;
	stats: TextStats;
}

function narrowGeneral(
	result: ExtractionResult,
): GeneralExtractionResult | null {
	if (isTemplateExtractionResult(result)) return null;
	return result;
}

/**
 * Image (general) mode component.
 *
 * - Multi-image upload via `p-fileUpload` (`mode="advanced"`,
 *   `customUpload`). Each selected file becomes one `ImageEntry`.
 * - Per image we call `TextCounterExtractionService.extract(..., 'general')`
 *   and render one card per image with rows of extracted text.
 * - Counts are computed via the same `computeStats` util as paste mode,
 *   driven by the same `loadSettings()` payload. The image-general
 *   tab intentionally does NOT render its own settings UI in V1 — it
 *   consumes whatever the paste tab last saved (R12 / R20).
 * - Inline edit per row via `<textarea pTextarea>`; counts re-compute
 *   immediately on every keystroke.
 * - Per-card error retry: if extraction fails for one image, that
 *   card surfaces the error + a Retry button; other cards proceed.
 * - One-time AI-vision consent banner (M11) — gated on at least one
 *   image being uploaded so it never shows on cold page load.
 * - No persistence: refreshing the page drops all images and rows
 *   (covers AE9 in part — see plan).
 */
@Component({
	selector: 'app-text-counter-image-general',
	standalone: true,
	templateUrl: './text-counter-image-general.component.html',
	styleUrls: ['./text-counter-image-general.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		FormsModule,
		PrimeNgModule,
		FileUploadModule,
		TextareaModule,
		TextCounterConsentBannerComponent,
	],
})
export class TextCounterImageGeneralComponent implements OnDestroy {
	private readonly destroyRef = inject(DestroyRef);
	private readonly extractionService = inject(TextCounterExtractionService);
	private readonly cdr = inject(ChangeDetectorRef);

	readonly orgId = environment.organizationId;
	readonly acceptMimes = ACCEPT_MIMES;
	readonly maxUploadBytes = MAX_UPLOAD_BYTES;
	readonly maxUploadMb = MAX_UPLOAD_BYTES / 1024 / 1024;

	readonly images = signal<ImageEntry[]>([]);
	readonly settings = signal<TextCounterSettings>(loadSettings());

	/**
	 * Active extraction subscriptions, keyed by entry id. Tracked so we
	 * can abort an in-flight request when the user removes a card or
	 * retries before the result arrives — mirrors the image-template
	 * orchestrator. Without this we'd silently pay the AI cost on cards
	 * the user already discarded (or on the orphaned half of a retry).
	 */
	private readonly extractionSubs = new Map<string, Subscription>();

	/**
	 * Entries waiting on AI-vision consent before the first extraction
	 * fires. We render the entry's card in `extracting` UI state but
	 * defer the actual HTTP POST until the user accepts the banner.
	 *
	 * Once consent is recorded (banner emits `accepted`), this list is
	 * drained. Drained-and-cleared on accept — subsequent uploads in
	 * the same session see `hasAIConsent()` true and skip the queue.
	 */
	private readonly pendingConsent = new Map<string, File>();

	/**
	 * Drives the per-row count display. Recomputed whenever images() or
	 * settings() change — so editing a row or flipping a setting in the
	 * paste tab re-rolls every count without manual wiring.
	 */
	readonly rowViews = computed<Record<string, RowView[]>>(() => {
		const settings = this.settings();
		const out: Record<string, RowView[]> = {};
		for (const img of this.images()) {
			out[img.id] = img.rows.map((r) => ({
				id: r.id,
				text: r.text,
				stats: computeStats(r.text, settings),
			}));
		}
		return out;
	});

	ngOnDestroy(): void {
		// Cancel any in-flight extractions so they don't try to update
		// a torn-down component.
		for (const sub of this.extractionSubs.values()) {
			sub.unsubscribe();
		}
		this.extractionSubs.clear();
		// Release any object URLs we minted for image previews.
		for (const entry of this.images()) {
			this.releasePreview(entry);
		}
	}

	/**
	 * `p-fileUpload[customUpload]` handler. Files rejected by PrimeNG's
	 * `accept` / `maxFileSize` filters never appear in `event.files`,
	 * so we can iterate them as-accepted.
	 */
	onUpload(event: unknown): void {
		const files = (event as { files?: File[] })?.files ?? [];
		if (files.length === 0) return;
		for (const file of files) {
			this.startExtraction(file);
		}
	}

	private startExtraction(file: File): void {
		const entry: ImageEntry = {
			id: nextId(),
			file,
			previewUrl: createImagePreviewUrl(file),
			status: 'extracting',
			rows: [],
			error: null,
		};
		this.images.update((list) => [...list, entry]);

		// Gate the FIRST extraction on AI-vision consent. Without this,
		// the banner renders only AFTER the request is already in
		// flight — disclosure rather than consent. When the flag is
		// already set (subsequent uploads, or a returning user), the
		// extraction fires immediately.
		if (!hasAIConsent()) {
			this.pendingConsent.set(entry.id, file);
			return;
		}
		this.runExtraction(entry.id, file);
	}

	/**
	 * Banner emitted `accepted`. Drain any extractions we deferred while
	 * waiting on consent.
	 */
	onConsentAccepted(): void {
		const queued = Array.from(this.pendingConsent.entries());
		this.pendingConsent.clear();
		for (const [entryId, file] of queued) {
			this.runExtraction(entryId, file);
		}
	}

	private runExtraction(entryId: string, file: File): void {
		// Cancel any previous in-flight extraction for this entry before
		// starting a new one (retry or repeat).
		const previous = this.extractionSubs.get(entryId);
		if (previous) {
			previous.unsubscribe();
			this.extractionSubs.delete(entryId);
		}

		const sub = this.extractionService
			.extract(this.orgId, file, 'general')
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (result) => {
					const general = narrowGeneral(result);
					this.images.update((list) =>
						list.map((entry) => {
							if (entry.id !== entryId) return entry;
							if (!general) {
								return {
									...entry,
									status: 'error',
									error: 'Unexpected template response for general extraction.',
								};
							}
							return {
								...entry,
								status: 'done',
								error: null,
								rows: general.regions.map((text) => ({
									id: nextId(),
									text,
								})),
							};
						}),
					);
					this.extractionSubs.delete(entryId);
					this.cdr.markForCheck();
				},
				error: (err: unknown) => {
					const message = extractErrorMessage(err, {
						fallback: 'Extraction failed.',
					});
					this.images.update((list) =>
						list.map((entry) =>
							entry.id === entryId
								? {
										...entry,
										status: 'error',
										error: message,
									}
								: entry,
						),
					);
					this.extractionSubs.delete(entryId);
					this.cdr.markForCheck();
				},
			});

		this.extractionSubs.set(entryId, sub);
	}

	/**
	 * Retry extraction for one card. Resets the entry to extracting and
	 * re-fires the same extraction call with the same original file.
	 */
	retry(entryId: string): void {
		const entry = this.images().find((e) => e.id === entryId);
		if (!entry) return;
		this.images.update((list) =>
			list.map((e) =>
				e.id === entryId
					? { ...e, status: 'extracting', error: null, rows: [] }
					: e,
			),
		);
		this.runExtraction(entryId, entry.file);
	}

	/**
	 * Remove an entry from the list and release its preview URL.
	 *
	 * Cancels the in-flight extraction (if any) so we don't pay the AI
	 * cost on a card the user just discarded.
	 */
	remove(entryId: string): void {
		const sub = this.extractionSubs.get(entryId);
		if (sub) {
			sub.unsubscribe();
			this.extractionSubs.delete(entryId);
		}
		// Drop from the consent-queue too — otherwise an accept later
		// would re-fire extraction on a card the user already removed.
		this.pendingConsent.delete(entryId);
		const entry = this.images().find((e) => e.id === entryId);
		if (entry) this.releasePreview(entry);
		this.images.update((list) => list.filter((e) => e.id !== entryId));
	}

	/**
	 * Inline edit. Updates the row's text; the rowViews computed picks
	 * up the change and re-rolls counts.
	 */
	onRowTextChange(
		entryId: string,
		rowId: string,
		value: string | null | undefined,
	): void {
		const next = value ?? '';
		this.images.update((list) =>
			list.map((entry) => {
				if (entry.id !== entryId) return entry;
				return {
					...entry,
					rows: entry.rows.map((row) =>
						row.id === rowId ? { ...row, text: next } : row,
					),
				};
			}),
		);
	}

	/**
	 * Stable trackBy for the *ngFor of image cards. Without this every
	 * row update would tear down and recreate the textarea.
	 */
	trackEntry(_: number, entry: ImageEntry): string {
		return entry.id;
	}

	trackRow(_: number, row: RowView): string {
		return row.id;
	}

	private releasePreview(entry: ImageEntry): void {
		if (!entry.previewUrl) return;
		revokeImagePreviewUrl(entry.previewUrl);
	}
}
