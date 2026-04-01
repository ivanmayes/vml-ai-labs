import { Component, signal, inject, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { WppOpenService } from '../../../../_core/services/wpp-open/wpp-open.service';
import {
	WppOpenAgentUpdaterService,
	UpdaterTask,
	TaskRun,
} from '../../services/wpp-open-agent-updater.service';

@Component({
	selector: 'app-wpp-open-agent-updater-task-detail',
	standalone: true,
	imports: [
		CommonModule,
		FormsModule,
		TableModule,
		TagModule,
		ButtonModule,
		CardModule,
		ToastModule,
		DialogModule,
		InputTextModule,
		ConfirmDialogModule,
	],
	providers: [MessageService, ConfirmationService],
	template: `
		<p-toast />
		<p-confirmDialog />
		<div class="p-4">
			@if (task()) {
				<p-card>
					<ng-template pTemplate="header">
						<div class="flex justify-between items-center p-3">
							<div>
								<h2 class="m-0">{{ task()!.name }}</h2>
								<p class="text-color-secondary mt-1 mb-0">
									<i class="pi pi-folder mr-1"></i>
									{{
										task()!.boxFolderName ||
											task()!.boxFolderId
									}}
									&nbsp;&middot;&nbsp;
									<i class="pi pi-bolt mr-1"></i>
									{{
										task()!.wppOpenAgentName ||
											task()!.wppOpenAgentId
									}}
								</p>
								<div
									class="flex gap-3 mt-2 text-color-secondary text-sm"
								>
									<span
										><i class="pi pi-file mr-1"></i
										>{{
											task()!.fileExtensions?.join(
												', '
											) || 'All types'
										}}</span
									>
									<span
										><i class="pi pi-folder-open mr-1"></i
										>{{
											task()!.includeSubfolders
												? 'Subfolders included'
												: 'Root folder only'
										}}</span
									>
									<span
										><i class="pi pi-clock mr-1"></i
										>{{ task()!.cadence || 'manual' }}</span
									>
								</div>
							</div>
							<div class="flex gap-2 items-center">
								<p-tag
									[value]="task()!.status"
									[severity]="
										getTaskStatusSeverity(task()!.status)
									"
								/>
								<p-button
									label="Run Now"
									icon="pi pi-play"
									(onClick)="onRun()"
									[disabled]="
										task()!.status !== 'active' ||
										runningTask()
									"
									[loading]="runningTask()"
								/>
								<p-button
									label="Edit"
									icon="pi pi-pencil"
									severity="secondary"
									[text]="true"
									(onClick)="
										router.navigate([
											'apps/wpp-open-agent-updater',
											task()!.id,
											'edit',
										])
									"
								/>
								<p-button
									icon="pi pi-arrow-left"
									[text]="true"
									[rounded]="true"
									aria-label="Back to list"
									(onClick)="
										router.navigate([
											'apps/wpp-open-agent-updater',
										])
									"
								/>
							</div>
						</div>
					</ng-template>

					<h3>Run History</h3>
					<p-table
						[value]="runs()"
						[loading]="loadingRuns()"
						styleClass="p-datatable-sm"
					>
						<ng-template pTemplate="header">
							<tr>
								<th>Date</th>
								<th>Status</th>
								<th>Files Found</th>
								<th>Processed</th>
								<th>Failed</th>
								<th>Duration</th>
								<th></th>
							</tr>
						</ng-template>
						<ng-template pTemplate="body" let-run>
							<tr>
								<td>{{ run.createdAt | date: 'medium' }}</td>
								<td>
									<p-tag
										[value]="run.status"
										[severity]="
											getRunStatusSeverity(run.status)
										"
									/>
								</td>
								<td>{{ run.filesFound }}</td>
								<td>{{ run.filesProcessed }}</td>
								<td>{{ run.filesFailed }}</td>
								<td>{{ getDuration(run) }}</td>
								<td>
									<p-button
										icon="pi pi-eye"
										[text]="true"
										[rounded]="true"
										aria-label="View run details"
										(onClick)="
											router.navigate([
												'apps/wpp-open-agent-updater/runs',
												run.id,
											])
										"
									/>
								</td>
							</tr>
						</ng-template>
						<ng-template pTemplate="emptymessage">
							<tr>
								<td
									colspan="7"
									class="text-center text-color-secondary py-4"
								>
									No runs yet. Click "Run Now" to start.
								</td>
							</tr>
						</ng-template>
					</p-table>
				</p-card>
			}
		</div>

		<!-- Token fallback dialog for standalone dev mode -->
		<p-dialog
			header="Enter WPP Open Token"
			[(visible)]="showTokenDialog"
			[modal]="true"
			[style]="{ width: '450px' }"
		>
			<div class="flex flex-col gap-3">
				<p class="text-color-secondary m-0">
					Could not obtain token automatically. Enter your WPP Open
					token to proceed.
				</p>
				<input
					pInputText
					[(ngModel)]="manualToken"
					placeholder="Paste WPP Open token"
					type="password"
					class="w-full"
				/>
			</div>
			<ng-template pTemplate="footer">
				<p-button
					label="Cancel"
					severity="secondary"
					[text]="true"
					(onClick)="showTokenDialog = false"
				/>
				<p-button
					label="Run"
					icon="pi pi-play"
					(onClick)="executeRun(manualToken)"
					[disabled]="!manualToken"
				/>
			</ng-template>
		</p-dialog>
	`,
})
export class TaskDetailComponent implements OnInit {
	readonly router = inject(Router);
	private readonly route = inject(ActivatedRoute);
	private readonly service = inject(WppOpenAgentUpdaterService);
	private readonly wppOpenService = inject(WppOpenService);
	private readonly messageService = inject(MessageService);
	private readonly confirmationService = inject(ConfirmationService);
	private readonly destroyRef = inject(DestroyRef);

	task = signal<UpdaterTask | null>(null);
	runs = signal<TaskRun[]>([]);
	loadingRuns = signal(true);
	runningTask = signal(false);

	showTokenDialog = false;
	manualToken = '';

	private taskId = '';

	ngOnInit(): void {
		this.taskId = this.route.snapshot.paramMap.get('taskId') || '';
		this.loadTask();
		this.loadRuns();
	}

	loadTask(): void {
		this.service
			.getTask(this.taskId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (task) => this.task.set(task),
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to load task',
					});
				},
			});
	}

	loadRuns(): void {
		this.loadingRuns.set(true);
		this.service
			.listRuns(this.taskId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (runs) => {
					this.runs.set(runs);
					this.loadingRuns.set(false);
				},
				error: () => this.loadingRuns.set(false),
			});
	}

	onRun(): void {
		this.confirmationService.confirm({
			message: `Run task "${this.task()?.name}" now? This will sync files to the agent's knowledge base.`,
			header: 'Confirm Run',
			icon: 'pi pi-play',
			accept: () => this.acquireTokenAndRun(),
		});
	}

	private async acquireTokenAndRun(): Promise<void> {
		this.runningTask.set(true);
		try {
			const token = await this.wppOpenService.getAccessToken();
			if (token) {
				this.executeRun(token as string);
			} else {
				this.runningTask.set(false);
				this.showTokenFallback();
			}
		} catch {
			this.runningTask.set(false);
			this.showTokenFallback();
		}
	}

	private showTokenFallback(): void {
		this.manualToken = '';
		this.showTokenDialog = true;
	}

	executeRun(token: string): void {
		this.showTokenDialog = false;
		this.runningTask.set(true);

		this.service
			.triggerRun(this.taskId, token)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.runningTask.set(false);
					this.messageService.add({
						severity: 'success',
						summary: 'Run Started',
						detail: 'Task run has been triggered',
					});
					this.loadRuns();
					this.loadTask();
				},
				error: (err) => {
					this.runningTask.set(false);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: err.error?.message || 'Failed to trigger run',
					});
				},
			});
	}

	getDuration(run: TaskRun): string {
		if (!run.startedAt || !run.completedAt) {
			return run.status === 'processing' ? 'Running...' : '-';
		}
		const ms =
			new Date(run.completedAt).getTime() -
			new Date(run.startedAt).getTime();
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60000) return `${Math.round(ms / 1000)}s`;
		return `${Math.round(ms / 60000)}m`;
	}

	getTaskStatusSeverity(
		status: string,
	): 'success' | 'warn' | 'secondary' | 'info' {
		switch (status) {
			case 'active':
				return 'success';
			case 'paused':
				return 'warn';
			case 'archived':
				return 'secondary';
			default:
				return 'info';
		}
	}

	getRunStatusSeverity(
		status: string,
	): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
		switch (status) {
			case 'completed':
				return 'success';
			case 'processing':
				return 'info';
			case 'pending':
				return 'warn';
			case 'failed':
				return 'danger';
			case 'cancelled':
				return 'secondary';
			default:
				return 'info';
		}
	}
}
