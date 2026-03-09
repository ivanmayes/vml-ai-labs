import { Component, signal, inject, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
	ReactiveFormsModule,
	FormBuilder,
	FormGroup,
	Validators,
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import {
	WppOpenAgentUpdaterService,
	BoxFolderInfo,
	WppOpenAgent,
} from '../../services/wpp-open-agent-updater.service';

@Component({
	selector: 'app-wpp-open-agent-updater-task-form',
	standalone: true,
	imports: [
		CommonModule,
		ReactiveFormsModule,
		InputTextModule,
		ButtonModule,
		SelectModule,
		CardModule,
		ToastModule,
	],
	providers: [MessageService],
	template: `
		<p-toast />
		<div class="p-4">
			<p-card [header]="isEdit() ? 'Edit Task' : 'New Task'">
				<form [formGroup]="form" (ngSubmit)="onSubmit()">
					<div class="flex flex-column gap-4">
						<!-- Task Name -->
						<div class="flex flex-column gap-2">
							<label for="name">Task Name</label>
							<input
								pInputText
								id="name"
								formControlName="name"
								placeholder="e.g., Weekly Brand Guidelines Sync"
							/>
						</div>

						<!-- Box Folder ID -->
						<div class="flex flex-column gap-2">
							<label for="boxFolderId">Box Folder ID</label>
							<div class="flex gap-2">
								<input
									pInputText
									id="boxFolderId"
									formControlName="boxFolderId"
									placeholder="e.g., 123456789"
									class="flex-grow-1"
								/>
								<p-button
									label="Validate"
									icon="pi pi-check"
									[loading]="validatingFolder()"
									(onClick)="validateFolder()"
									[disabled]="!form.get('boxFolderId')?.value"
								/>
							</div>
							@if (folderInfo()) {
								<div
									class="mt-1 p-2 border-round"
									style="background: var(--p-green-50); color: var(--p-green-700)"
								>
									<i class="pi pi-check-circle mr-2"></i>
									{{ folderInfo()!.name }} ({{
										folderInfo()!.fileCount
									}}
									items)
								</div>
							}
						</div>

						<!-- WPP Open Project ID -->
						<div class="flex flex-column gap-2">
							<label for="wppOpenProjectId"
								>WPP Open Project ID</label
							>
							<input
								pInputText
								id="wppOpenProjectId"
								formControlName="wppOpenProjectId"
								placeholder="Project ID from WPP Open"
							/>
						</div>

						<!-- WPP Open Token (for agent list) -->
						<div class="flex flex-column gap-2">
							<label for="wppOpenToken"
								>WPP Open Token (to load agents)</label
							>
							<div class="flex gap-2">
								<input
									pInputText
									id="wppOpenToken"
									formControlName="wppOpenToken"
									placeholder="Paste your WPP Open token"
									class="flex-grow-1"
									type="password"
								/>
								<p-button
									label="Load Agents"
									icon="pi pi-refresh"
									[loading]="loadingAgents()"
									(onClick)="loadAgents()"
									[disabled]="
										!form.get('wppOpenToken')?.value ||
										!form.get('wppOpenProjectId')?.value
									"
								/>
							</div>
						</div>

						<!-- WPP Open Agent -->
						<div class="flex flex-column gap-2">
							<label for="wppOpenAgentId">WPP Open Agent</label>
							<p-select
								formControlName="wppOpenAgentId"
								[options]="agents()"
								optionLabel="name"
								optionValue="id"
								placeholder="Select an agent"
								[filter]="true"
								[disabled]="agents().length === 0"
							/>
						</div>

						<!-- Actions -->
						<div class="flex gap-2 justify-content-end">
							<p-button
								label="Cancel"
								severity="secondary"
								[text]="true"
								(onClick)="
									router.navigate([
										'apps/wpp-open-agent-updater',
									])
								"
							/>
							<p-button
								label="Save"
								icon="pi pi-save"
								type="submit"
								[disabled]="form.invalid || saving()"
								[loading]="saving()"
							/>
						</div>
					</div>
				</form>
			</p-card>
		</div>
	`,
})
export class TaskFormComponent implements OnInit {
	readonly router = inject(Router);
	private readonly route = inject(ActivatedRoute);
	private readonly fb = inject(FormBuilder);
	private readonly service = inject(WppOpenAgentUpdaterService);
	private readonly messageService = inject(MessageService);
	private readonly destroyRef = inject(DestroyRef);

	isEdit = signal(false);
	taskId = signal<string | null>(null);
	saving = signal(false);
	validatingFolder = signal(false);
	loadingAgents = signal(false);
	folderInfo = signal<BoxFolderInfo | null>(null);
	agents = signal<WppOpenAgent[]>([]);

	form: FormGroup = this.fb.group({
		name: ['', Validators.required],
		boxFolderId: ['', Validators.required],
		wppOpenProjectId: ['', Validators.required],
		wppOpenAgentId: ['', Validators.required],
		wppOpenToken: [''],
	});

	ngOnInit(): void {
		const taskId = this.route.snapshot.paramMap.get('taskId');
		if (taskId) {
			this.isEdit.set(true);
			this.taskId.set(taskId);
			this.loadTask(taskId);
		}
	}

	loadTask(id: string): void {
		this.service
			.getTask(id)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (task) => {
					this.form.patchValue({
						name: task.name,
						boxFolderId: task.boxFolderId,
						wppOpenProjectId: task.wppOpenProjectId,
						wppOpenAgentId: task.wppOpenAgentId,
					});
				},
				error: () => {
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to load task',
					});
				},
			});
	}

	validateFolder(): void {
		const folderId = this.form.get('boxFolderId')?.value;
		if (!folderId) return;

		this.validatingFolder.set(true);
		this.folderInfo.set(null);

		this.service
			.validateBoxFolder(folderId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (info) => {
					this.folderInfo.set(info);
					this.validatingFolder.set(false);
				},
				error: () => {
					this.validatingFolder.set(false);
					this.messageService.add({
						severity: 'error',
						summary: 'Invalid Folder',
						detail: 'Could not access this Box folder.',
					});
				},
			});
	}

	loadAgents(): void {
		const token = this.form.get('wppOpenToken')?.value;
		const projectId = this.form.get('wppOpenProjectId')?.value;
		if (!token || !projectId) return;

		this.loadingAgents.set(true);
		this.service
			.listAgents(projectId, token)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (agents) => {
					this.agents.set(agents);
					this.loadingAgents.set(false);
				},
				error: () => {
					this.loadingAgents.set(false);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to load agents. Check your token and project ID.',
					});
				},
			});
	}

	onSubmit(): void {
		if (this.form.invalid) return;

		this.saving.set(true);
		const value = this.form.value;

		const request$ = this.isEdit()
			? this.service.updateTask(this.taskId()!, {
					name: value.name,
				})
			: this.service.createTask({
					name: value.name,
					boxFolderId: value.boxFolderId,
					wppOpenAgentId: value.wppOpenAgentId,
					wppOpenProjectId: value.wppOpenProjectId,
					wppOpenToken: value.wppOpenToken,
				});

		request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
			next: () => {
				this.messageService.add({
					severity: 'success',
					summary: 'Saved',
					detail: this.isEdit() ? 'Task updated' : 'Task created',
				});
				this.router.navigate(['apps/wpp-open-agent-updater']);
			},
			error: () => {
				this.saving.set(false);
				this.messageService.add({
					severity: 'error',
					summary: 'Error',
					detail: 'Failed to save task',
				});
			},
		});
	}
}
