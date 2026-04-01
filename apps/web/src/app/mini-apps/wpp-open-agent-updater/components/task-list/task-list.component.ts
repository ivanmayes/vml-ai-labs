import { Component, signal, inject, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { WppOpenService } from '../../../../_core/services/wpp-open/wpp-open.service';
import {
	WppOpenAgentUpdaterService,
	UpdaterTask,
} from '../../services/wpp-open-agent-updater.service';

@Component({
	selector: 'app-wpp-open-agent-updater-task-list',
	standalone: true,
	imports: [
		CommonModule,
		FormsModule,
		TableModule,
		TagModule,
		ButtonModule,
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
			<div class="flex justify-between items-center mb-4">
				<div>
					<h2 class="m-0">WPP Open Agent Updater</h2>
					<p class="text-color-secondary mt-1">
						Sync Box folder documents into WPP Open agent knowledge
						bases.
					</p>
				</div>
				<p-button
					label="New Task"
					icon="pi pi-plus"
					(onClick)="
						router.navigate(['apps/wpp-open-agent-updater/new'])
					"
				/>
			</div>

			<p-table
				[value]="tasks()"
				[loading]="loading()"
				[paginator]="true"
				[rows]="10"
				[showCurrentPageReport]="true"
				currentPageReportTemplate="Showing {first} to {last} of {totalRecords} tasks"
				styleClass="p-datatable-sm"
			>
				<ng-template pTemplate="header">
					<tr>
						<th>Name</th>
						<th>Box Folder</th>
						<th>Agent</th>
						<th>Status</th>
						<th>Last Run</th>
						<th style="width: 200px">Actions</th>
					</tr>
				</ng-template>
				<ng-template pTemplate="body" let-task>
					<tr>
						<td>{{ task.name }}</td>
						<td>
							<span class="text-color-secondary">{{
								task.boxFolderName || task.boxFolderId
							}}</span>
						</td>
						<td>
							<span class="text-color-secondary">{{
								task.wppOpenAgentName || task.wppOpenAgentId
							}}</span>
						</td>
						<td>
							<p-tag
								[value]="task.status"
								[severity]="getStatusSeverity(task.status)"
							/>
						</td>
						<td>
							{{
								task.lastRunAt
									? (task.lastRunAt | date: 'short')
									: 'Never'
							}}
						</td>
						<td>
							<div class="flex gap-2">
								<p-button
									icon="pi pi-play"
									[text]="true"
									[rounded]="true"
									severity="success"
									aria-label="Run task"
									(onClick)="onRun(task)"
									[disabled]="task.status !== 'active'"
								/>
								<p-button
									icon="pi pi-eye"
									[text]="true"
									[rounded]="true"
									aria-label="View task"
									(onClick)="
										router.navigate([
											'apps/wpp-open-agent-updater',
											task.id,
										])
									"
								/>
								<p-button
									icon="pi pi-trash"
									[text]="true"
									[rounded]="true"
									severity="danger"
									aria-label="Archive task"
									(onClick)="onDelete(task)"
									[disabled]="task.status === 'archived'"
								/>
							</div>
						</td>
					</tr>
				</ng-template>
				<ng-template pTemplate="emptymessage">
					<tr>
						<td colspan="6" class="text-center py-5">
							<p class="text-color-secondary">
								No tasks configured yet.
							</p>
							<p-button
								label="Create your first task"
								icon="pi pi-plus"
								[text]="true"
								(onClick)="
									router.navigate([
										'apps/wpp-open-agent-updater/new',
									])
								"
							/>
						</td>
					</tr>
				</ng-template>
			</p-table>
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
					token to run "{{ pendingRunTask()?.name }}".
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
					(onClick)="executeRun(pendingRunTask()!, manualToken)"
					[disabled]="!manualToken"
				/>
			</ng-template>
		</p-dialog>
	`,
})
export class TaskListComponent implements OnInit {
	readonly router = inject(Router);
	private readonly service = inject(WppOpenAgentUpdaterService);
	private readonly wppOpenService = inject(WppOpenService);
	private readonly messageService = inject(MessageService);
	private readonly confirmationService = inject(ConfirmationService);
	private readonly destroyRef = inject(DestroyRef);

	tasks = signal<UpdaterTask[]>([]);
	loading = signal(true);
	pendingRunTask = signal<UpdaterTask | null>(null);

	showTokenDialog = false;
	manualToken = '';

	ngOnInit(): void {
		this.loadTasks();
	}

	loadTasks(): void {
		this.loading.set(true);
		this.service
			.listTasks()
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (tasks) => {
					this.tasks.set(tasks);
					this.loading.set(false);
				},
				error: () => {
					this.loading.set(false);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to load tasks',
					});
				},
			});
	}

	onRun(task: UpdaterTask): void {
		this.confirmationService.confirm({
			message: `Run task "${task.name}" now? This will sync files to the agent's knowledge base.`,
			header: 'Confirm Run',
			icon: 'pi pi-play',
			accept: () => this.acquireTokenAndRun(task),
		});
	}

	private async acquireTokenAndRun(task: UpdaterTask): Promise<void> {
		try {
			const token = await this.wppOpenService.getAccessToken();
			if (token) {
				this.executeRun(task, token as string);
			} else {
				this.showTokenFallback(task);
			}
		} catch {
			this.showTokenFallback(task);
		}
	}

	private showTokenFallback(task: UpdaterTask): void {
		this.pendingRunTask.set(task);
		this.manualToken = '';
		this.showTokenDialog = true;
	}

	executeRun(task: UpdaterTask, token: string): void {
		this.showTokenDialog = false;

		this.service
			.triggerRun(task.id, token)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'success',
						summary: 'Run Started',
						detail: `Run triggered for "${task.name}"`,
					});
					this.loadTasks();
				},
				error: (err) => {
					this.messageService.add({
						severity: 'error',
						summary: 'Run Failed',
						detail: err.error?.message || 'Failed to trigger run',
					});
				},
			});
	}

	onDelete(task: UpdaterTask): void {
		this.service
			.deleteTask(task.id)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'info',
						summary: 'Archived',
						detail: `Task "${task.name}" archived`,
					});
					this.loadTasks();
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to archive task',
					});
				},
			});
	}

	getStatusSeverity(
		status: string,
	): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
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
}
