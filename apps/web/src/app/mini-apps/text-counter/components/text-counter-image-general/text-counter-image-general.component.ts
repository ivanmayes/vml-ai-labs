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
import { computeStats } from '../../services/text-counter.util';
import { TextCounterExtractionService } from '../../services/text-counter-extraction.service';
import { TextCounterConsentBannerComponent } from '../text-counter-consent-banner/text-counter-consent-banner.component';

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

const ACCEPT_MIMES = 'image/png,image/jpeg,image/webp,image/gif';
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function nextId(): string {
	if (
		typeof crypto !== 'undefined' &&
		typeof crypto.randomUUID === 'function'
	) {
		return crypto.randomUUID();
	}
	// Fallback for environments without crypto.randomUUID — collision-resistant
	// enough for in-memory keys in tests.
	return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
			previewUrl: this.createPreview(file),
			status: 'extracting',
			rows: [],
			error: null,
		};
		this.images.update((list) => [...list, entry]);
		this.runExtraction(entry.id, file);
	}

	private runExtraction(entryId: string, file: File): void {
		this.extractionService
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
					this.cdr.markForCheck();
				},
				error: (err) => {
					const message =
						err?.error?.message ??
						(typeof err?.message === 'string'
							? err.message
							: 'Extraction failed. Try again.');
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
					this.cdr.markForCheck();
				},
			});
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
	 */
	remove(entryId: string): void {
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

	private createPreview(file: File): string {
		try {
			return URL.createObjectURL(file);
		} catch {
			return '';
		}
	}

	private releasePreview(entry: ImageEntry): void {
		if (!entry.previewUrl) return;
		try {
			URL.revokeObjectURL(entry.previewUrl);
		} catch {
			/* no-op */
		}
	}
}
