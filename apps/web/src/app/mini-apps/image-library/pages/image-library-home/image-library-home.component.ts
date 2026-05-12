import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	DestroyRef,
	inject,
	OnInit,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ConfirmationService, MessageService } from 'primeng/api';
import { FileUploadModule } from 'primeng/fileupload';
import { PaginatorState } from 'primeng/paginator';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import { PrimeNgModule } from '../../../../shared/primeng.module';
import { SpaceService } from '../../../../shared/services/space.service';
import type { ImageResponse } from '../../models/image-library.types';
import { ImageLibraryWebService } from '../../services/image-library.service';
import { copyImageBlobToClipboard } from '../../services/image-clipboard.util';
import { shareImage } from '../../services/image-share.util';

interface AutoCompleteCompleteEvent {
	originalEvent: Event;
	query: string;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

@Component({
	selector: 'app-image-library-home',
	standalone: true,
	templateUrl: './image-library-home.component.html',
	styleUrls: ['./image-library-home.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, FormsModule, PrimeNgModule, FileUploadModule],
	providers: [MessageService, ConfirmationService],
})
export class ImageLibraryHomeComponent implements OnInit {
	private readonly route = inject(ActivatedRoute);
	private readonly router = inject(Router);
	private readonly destroyRef = inject(DestroyRef);
	private readonly imageService = inject(ImageLibraryWebService);
	private readonly spaceService = inject(SpaceService);
	private readonly messageService = inject(MessageService);
	private readonly confirmService = inject(ConfirmationService);
	private readonly cdr = inject(ChangeDetectorRef);

	readonly orgId = environment.organizationId;
	readonly pageSizeOptions = [...PAGE_SIZE_OPTIONS];
	readonly maxUploadBytes = MAX_UPLOAD_BYTES;
	readonly maxUploadMb = MAX_UPLOAD_BYTES / 1024 / 1024;
	readonly acceptMimes = 'image/png,image/jpeg,image/webp,image/gif';

	readonly spaceId = signal<string | null>(null);
	readonly spaceName = signal<string | null>(null);
	readonly availableSpaces = signal<{ id: string; name: string }[]>([]);
	readonly availableSpacesLoading = signal(false);
	readonly availableSpacesError = signal<string | null>(null);
	readonly images = signal<ImageResponse[]>([]);
	readonly total = signal(0);
	readonly loading = signal(false);
	readonly listError = signal<string | null>(null);

	readonly selectedTags = signal<string[]>([]);
	readonly tagSuggestions = signal<string[]>([]);

	readonly pageSize = signal<number>(DEFAULT_PAGE_SIZE);
	readonly page = signal<number>(1);

	readonly uploadModalOpen = signal(false);
	readonly uploading = signal(false);
	readonly uploadTags = signal<string[]>([]);
	readonly uploadTagSuggestions = signal<string[]>([]);

	readonly selectedImage = signal<ImageResponse | null>(null);
	readonly detailVisible = signal(false);
	readonly clipboardBusy = signal(false);
	readonly shareFallback = signal<{
		mailto: string;
		sms: string | null;
		url: string;
	} | null>(null);

	ngOnInit(): void {
		this.route.paramMap
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe((params) => {
				const id = params.get('spaceId');
				this.spaceId.set(id);
				this.spaceName.set(null);
				if (id) {
					this.pageSize.set(this.loadPersistedPageSize(id));
					this.fetchSpaceName(id);
					this.refresh();
				} else {
					this.fetchAvailableSpaces();
				}
			});
	}

	private fetchAvailableSpaces(): void {
		this.availableSpacesLoading.set(true);
		this.availableSpacesError.set(null);
		this.spaceService
			.getSpaces(this.orgId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (resp) => {
					const data = (
						resp as { data?: { id: string; name: string }[] }
					)?.data;
					this.availableSpaces.set(Array.isArray(data) ? data : []);
					this.availableSpacesLoading.set(false);
					this.cdr.markForCheck();
				},
				error: () => {
					this.availableSpaces.set([]);
					this.availableSpacesLoading.set(false);
					this.availableSpacesError.set('cannot-list');
					this.cdr.markForCheck();
				},
			});
	}

	openSpace(id: string): void {
		void this.router.navigate(['/apps/image-library', id]);
	}

	private fetchSpaceName(spaceId: string): void {
		this.spaceService
			.getSpace(spaceId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (resp) => {
					const name =
						(resp as { data?: { name?: string }; name?: string })
							?.data?.name ??
						(resp as { name?: string })?.name ??
						null;
					this.spaceName.set(name);
					this.cdr.markForCheck();
				},
				error: () => {
					/* leave spaceName null; header falls back to the UUID label */
				},
			});
	}

	// --- Persistence -------------------------------------------------------

	private pageSizeKey(spaceId: string): string {
		return `il:pageSize:${spaceId}`;
	}

	private loadPersistedPageSize(spaceId: string): number {
		try {
			const raw = localStorage.getItem(this.pageSizeKey(spaceId));
			const parsed = raw ? Number(raw) : NaN;
			return PAGE_SIZE_OPTIONS.includes(parsed as 25 | 50 | 100)
				? parsed
				: DEFAULT_PAGE_SIZE;
		} catch {
			return DEFAULT_PAGE_SIZE;
		}
	}

	private persistPageSize(value: number): void {
		const sid = this.spaceId();
		if (!sid) return;
		try {
			localStorage.setItem(this.pageSizeKey(sid), String(value));
		} catch {
			/* swallow quota errors */
		}
	}

	// --- List + filter -----------------------------------------------------

	refresh(): void {
		const sid = this.spaceId();
		if (!sid) return;
		this.loading.set(true);
		this.listError.set(null);
		this.imageService
			.listImages(this.orgId, sid, {
				tags: this.selectedTags(),
				page: this.page(),
				pageSize: this.pageSize(),
				sort: 'newest',
			})
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (resp) => {
					this.images.set(resp.data.items);
					this.total.set(resp.data.total);
					this.loading.set(false);
					this.cdr.markForCheck();
				},
				error: (err) => {
					this.listError.set(
						err?.error?.message ?? 'Unable to load images',
					);
					this.loading.set(false);
					this.cdr.markForCheck();
				},
			});
	}

	onTagsChange(tags: unknown): void {
		const clean = Array.isArray(tags)
			? tags.filter(
					(s): s is string => typeof s === 'string' && s.length > 0,
				)
			: [];
		this.selectedTags.set(this.dedupe(clean));
		this.page.set(1);
		this.refresh();
	}

	clearAll(): void {
		this.selectedTags.set([]);
		this.page.set(1);
		this.refresh();
	}

	/**
	 * PrimeNG v20 p-autoComplete[multiple] doesn't add free-typed values on
	 * Enter — only on suggestion-click. We intercept Enter here so a user
	 * who types a brand-new tag and hits Enter actually gets a chip.
	 */
	commitTypedTag(target: 'filter' | 'upload', evt: KeyboardEvent): void {
		if (evt.key !== 'Enter') return;
		const input = evt.target as HTMLInputElement | null;
		const raw = input?.value?.trim();
		if (!raw) return;
		evt.preventDefault();
		evt.stopPropagation();
		if (target === 'filter') {
			const next = this.dedupe([...this.selectedTags(), raw]);
			this.selectedTags.set(next);
			this.page.set(1);
			this.refresh();
		} else {
			this.uploadTags.set(this.dedupe([...this.uploadTags(), raw]));
		}
		if (input) input.value = '';
	}

	completeFilterTags(evt: AutoCompleteCompleteEvent): void {
		this.fetchTagSuggestions(evt.query, this.tagSuggestions);
	}

	completeUploadTags(evt: AutoCompleteCompleteEvent): void {
		this.fetchTagSuggestions(evt.query, this.uploadTagSuggestions);
	}

	private fetchTagSuggestions(
		q: string,
		target: ReturnType<typeof signal<string[]>>,
	): void {
		const sid = this.spaceId();
		if (!sid) return;
		this.imageService
			.suggestTags(this.orgId, sid, q ?? '', 20)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (resp) => {
					target.set(resp.data.suggestions.map((s) => s.tag));
					this.cdr.markForCheck();
				},
				error: () => target.set([]),
			});
	}

	onPageChange(evt: PaginatorState): void {
		this.page.set((evt.page ?? 0) + 1);
		const rows = (evt as { rows?: number }).rows;
		if (typeof rows === 'number' && rows !== this.pageSize()) {
			this.pageSize.set(rows);
			this.persistPageSize(rows);
		}
		this.refresh();
	}

	// --- Upload modal ------------------------------------------------------

	openUploadModal(): void {
		this.uploadTags.set([]);
		this.uploadTagSuggestions.set([]);
		this.uploadModalOpen.set(true);
	}

	closeUploadModal(): void {
		if (this.uploading()) return;
		this.uploadModalOpen.set(false);
	}

	onUpload(event: unknown): void {
		const sid = this.spaceId();
		if (!sid) return;
		const files = (event as { files?: File[] })?.files ?? [];
		if (files.length === 0) return;
		if (files.length > 1) {
			this.messageService.add({
				severity: 'warn',
				summary: 'One at a time',
				detail: 'Please upload one image at a time.',
				life: 3000,
			});
			return;
		}
		const file = files[0];
		if (file.size > MAX_UPLOAD_BYTES) {
			this.messageService.add({
				severity: 'error',
				summary: 'File too large',
				detail: `${file.name} exceeds the ${this.maxUploadMb} MB limit.`,
				life: 4000,
			});
			return;
		}

		this.uploading.set(true);
		this.imageService
			.uploadImage(this.orgId, sid, file, this.uploadTags())
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (resp) => {
					this.uploading.set(false);
					this.uploadModalOpen.set(false);
					this.messageService.add({
						severity: 'success',
						summary: 'Uploaded',
						detail: resp.data.originalFilename,
						life: 2500,
					});
					this.page.set(1);
					this.refresh();
				},
				error: (err) => {
					this.uploading.set(false);
					this.messageService.add({
						severity: 'error',
						summary: 'Upload failed',
						detail:
							err?.error?.message ??
							'Unable to upload image. Try a different file.',
						life: 5000,
					});
					this.cdr.markForCheck();
				},
			});
	}

	onUploadTagsChange(tags: unknown): void {
		const clean = Array.isArray(tags)
			? tags.filter(
					(s): s is string => typeof s === 'string' && s.length > 0,
				)
			: [];
		this.uploadTags.set(this.dedupe(clean));
	}

	// --- Detail dialog actions --------------------------------------------

	openDetail(image: ImageResponse): void {
		this.selectedImage.set(image);
		this.shareFallback.set(null);
		this.detailVisible.set(true);
	}

	closeDetail(): void {
		this.detailVisible.set(false);
		this.selectedImage.set(null);
		this.shareFallback.set(null);
	}

	async downloadImage(): Promise<void> {
		const img = this.selectedImage();
		const sid = this.spaceId();
		if (!img || !sid) return;
		try {
			const blob = await firstValueFrom(
				this.imageService.getImageContent(this.orgId, sid, img.id),
			);
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = img.originalFilename;
			a.style.display = 'none';
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch {
			this.messageService.add({
				severity: 'error',
				summary: 'Download failed',
				detail: 'Unable to download this image. Try Copy link instead.',
				life: 4000,
			});
		}
	}

	async copyImage(): Promise<void> {
		const img = this.selectedImage();
		const sid = this.spaceId();
		if (!img || !sid || this.clipboardBusy()) return;
		this.clipboardBusy.set(true);
		try {
			const blob = await firstValueFrom(
				this.imageService.getImageContent(this.orgId, sid, img.id),
			);
			const ok = await copyImageBlobToClipboard(blob);
			if (ok) {
				this.messageService.add({
					severity: 'success',
					summary: 'Image copied',
					detail: 'Paste into Claude, ChatGPT, or Gemini to attach.',
					life: 2500,
				});
			} else {
				await this.copyLink(true);
			}
		} catch {
			await this.copyLink(true);
		} finally {
			this.clipboardBusy.set(false);
		}
	}

	async copyLink(asFallback = false): Promise<void> {
		const img = this.selectedImage();
		if (!img) return;
		try {
			await navigator.clipboard.writeText(img.signedUrl);
			this.messageService.add({
				severity: asFallback ? 'warn' : 'success',
				summary: asFallback
					? "Couldn't copy image — copied link instead"
					: 'Link copied',
				detail: 'Paste into a chat, email, or browser tab.',
				life: 3000,
			});
		} catch {
			this.messageService.add({
				severity: 'error',
				summary: 'Copy failed',
				detail: 'Clipboard access was denied.',
				life: 3000,
			});
		}
	}

	async share(): Promise<void> {
		const img = this.selectedImage();
		if (!img) return;
		this.shareFallback.set(null);
		const result = await shareImage({
			signedUrl: img.signedUrl,
			filename: img.originalFilename,
			mime: img.mime,
		});
		this.cdr.markForCheck();
		if (result.kind === 'shared') {
			this.messageService.add({
				severity: 'success',
				summary: 'Shared',
				life: 2000,
			});
		} else if (result.kind === 'fallback') {
			this.shareFallback.set({
				mailto: result.mailto,
				sms: result.sms,
				url: result.url,
			});
		} else if (result.kind === 'error') {
			this.messageService.add({
				severity: 'error',
				summary: 'Share failed',
				detail: 'Unable to share this image.',
				life: 3000,
			});
		}
	}

	delete(): void {
		const img = this.selectedImage();
		const sid = this.spaceId();
		if (!img || !sid) return;
		this.confirmService.confirm({
			message: `Delete "${img.originalFilename}"? This can't be undone.`,
			header: 'Delete image',
			icon: 'pi pi-exclamation-triangle',
			acceptLabel: 'Delete',
			rejectLabel: 'Cancel',
			acceptButtonStyleClass: 'p-button-danger',
			accept: () => {
				this.imageService
					.deleteImage(this.orgId, sid, img.id)
					.pipe(takeUntilDestroyed(this.destroyRef))
					.subscribe({
						next: () => {
							this.messageService.add({
								severity: 'success',
								summary: 'Deleted',
								life: 2000,
							});
							this.closeDetail();
							this.refresh();
						},
						error: (err) => {
							this.messageService.add({
								severity: 'error',
								summary: 'Delete failed',
								detail:
									err?.error?.message ??
									'Unable to delete this image.',
								life: 4000,
							});
						},
					});
			},
		});
	}

	private dedupe(values: string[]): string[] {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const raw of values) {
			const key = raw.trim().toLowerCase();
			if (!key || seen.has(key)) continue;
			seen.add(key);
			out.push(raw.trim());
		}
		return out;
	}
}
