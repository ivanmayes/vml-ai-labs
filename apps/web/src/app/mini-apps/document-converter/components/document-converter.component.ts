import {
	Component,
	signal,
	inject,
	OnInit,
	OnDestroy,
	DestroyRef,
	viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FileUploadModule, FileUpload } from 'primeng/fileupload';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';

import {
	DocumentConverterService,
	ConversionJob,
} from '../services/document-converter.service';

@Component({
	selector: 'app-document-converter',
	standalone: true,
	imports: [
		CommonModule,
		FileUploadModule,
		TableModule,
		TagModule,
		ButtonModule,
		ToastModule,
		ProgressSpinnerModule,
	],
	providers: [MessageService],
	template: `
		<p-toast />
		<div class="p-4">
			<h2>Document Converter</h2>
			<p class="text-color-secondary mb-4">
				Upload documents (DOCX, PDF, XLSX, PPTX) to convert them to
				Markdown.
			</p>

			<p-fileUpload
				#fileUploader
				mode="advanced"
				name="file"
				[multiple]="false"
				accept=".docx,.pdf,.xlsx,.pptx"
				[maxFileSize]="52428800"
				[auto]="false"
				chooseLabel="Choose File"
				uploadLabel="Convert"
				cancelLabel="Cancel"
				[customUpload]="true"
				(uploadHandler)="onUpload($event)"
			>
				<ng-template pTemplate="empty">
					<div
						class="flex align-items-center justify-content-center flex-column py-5"
					>
						<i
							class="pi pi-cloud-upload text-4xl text-color-secondary mb-3"
						></i>
						<p class="text-color-secondary">
							Drag and drop files here to convert
						</p>
					</div>
				</ng-template>
			</p-fileUpload>

			<div class="mt-4">
				<div
					class="flex justify-content-between align-items-center mb-3"
				>
					<h3 class="m-0">Conversion Jobs</h3>
					<p-button
						icon="pi pi-refresh"
						label="Refresh"
						[text]="true"
						(onClick)="loadJobs()"
					/>
				</div>

				@if (loading()) {
					<div class="flex justify-content-center p-4">
						<p-progressSpinner strokeWidth="4" />
					</div>
				} @else {
					<p-table
						[value]="jobs()"
						[paginator]="true"
						[rows]="10"
						styleClass="p-datatable-sm"
					>
						<ng-template pTemplate="header">
							<tr>
								<th>File</th>
								<th>Size</th>
								<th>Status</th>
								<th>Engine</th>
								<th>Created</th>
								<th>Actions</th>
							</tr>
						</ng-template>
						<ng-template pTemplate="body" let-job>
							<tr>
								<td>{{ job.fileName }}</td>
								<td>{{ formatSize(job.fileSize) }}</td>
								<td>
									<p-tag
										[value]="job.status"
										[severity]="
											getStatusSeverity(job.status)
										"
									/>
								</td>
								<td>{{ job.engine || '-' }}</td>
								<td>{{ job.createdAt | date: 'short' }}</td>
								<td>
									@if (job.status === 'completed') {
										<p-button
											icon="pi pi-download"
											[text]="true"
											size="small"
											ariaLabel="Download converted file"
											(onClick)="downloadJob(job)"
										/>
									}
									@if (
										job.status === 'pending' ||
										job.status === 'processing'
									) {
										<p-button
											icon="pi pi-times"
											[text]="true"
											severity="danger"
											size="small"
											ariaLabel="Cancel conversion job"
											(onClick)="cancelJob(job)"
										/>
									}
									@if (job.status === 'failed') {
										<p-button
											icon="pi pi-replay"
											[text]="true"
											severity="warn"
											size="small"
											ariaLabel="Retry failed conversion"
											(onClick)="retryJob(job)"
										/>
									}
								</td>
							</tr>
						</ng-template>
						<ng-template pTemplate="emptymessage">
							<tr>
								<td
									colspan="6"
									class="text-center text-color-secondary p-4"
								>
									No conversion jobs yet. Upload a document to
									get started.
								</td>
							</tr>
						</ng-template>
					</p-table>
				}
			</div>
		</div>
	`,
})
export class DocumentConverterComponent implements OnInit, OnDestroy {
	private readonly converterService = inject(DocumentConverterService);
	private readonly messageService = inject(MessageService);
	private readonly destroyRef = inject(DestroyRef);
	private refreshInterval: ReturnType<typeof setInterval> | null = null;

	readonly fileUpload = viewChild<FileUpload>('fileUploader');

	jobs = signal<ConversionJob[]>([]);
	loading = signal(false);

	ngOnInit(): void {
		this.loadJobs();
		// Auto-refresh every 10 seconds
		this.refreshInterval = setInterval(() => this.refreshJobs(), 10000);
	}

	ngOnDestroy(): void {
		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
		}
	}

	loadJobs(): void {
		this.loading.set(true);
		this.converterService
			.listJobs()
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					this.jobs.set(res.data?.data || []);
					this.loading.set(false);
				},
				error: () => {
					this.loading.set(false);
				},
			});
	}

	/** Silent refresh that does not show loading spinner (prevents table flicker). */
	private refreshJobs(): void {
		this.converterService
			.listJobs()
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					this.jobs.set(res.data?.data || []);
				},
			});
	}

	onUpload(event: { files: File[] }): void {
		const file = event.files?.[0];
		if (!file) return;

		this.converterService
			.uploadFile(file)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'success',
						summary: 'Uploaded',
						detail: `${file.name} queued for conversion`,
					});
					this.fileUpload()?.clear();
					this.loadJobs();
				},
				error: (err: { error?: { data?: string } }) => {
					this.messageService.add({
						severity: 'error',
						summary: 'Upload Failed',
						detail: err.error?.data || 'Failed to upload file',
					});
				},
			});
	}

	downloadJob(job: ConversionJob): void {
		this.converterService
			.getDownloadUrl(job.id)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (res) => {
					window.open(res.data.downloadUrl, '_blank');
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Download Failed',
						detail: 'Could not generate download link',
					});
				},
			});
	}

	cancelJob(job: ConversionJob): void {
		this.converterService
			.cancelJob(job.id)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'info',
						summary: 'Cancelled',
						detail: `Job cancelled`,
					});
					this.loadJobs();
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Could not cancel job',
					});
				},
			});
	}

	retryJob(job: ConversionJob): void {
		this.converterService
			.retryJob(job.id)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'info',
						summary: 'Retrying',
						detail: `Job requeued for processing`,
					});
					this.loadJobs();
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Could not retry job',
					});
				},
			});
	}

	getStatusSeverity(
		status: string,
	): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
		const map: Record<
			string,
			'success' | 'info' | 'warn' | 'danger' | 'secondary'
		> = {
			completed: 'success',
			processing: 'info',
			pending: 'warn',
			failed: 'danger',
			cancelled: 'secondary',
		};
		return map[status] || 'info';
	}

	formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
}
