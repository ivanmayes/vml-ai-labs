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
import { debounceTime, distinctUntilChanged, filter } from 'rxjs/operators';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { CardModule } from 'primeng/card';
import { ToastModule } from 'primeng/toast';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';

import { WppOpenService } from '../../../../_core/services/wpp-open/wpp-open.service';
import {
	WppOpenAgentUpdaterService,
	BoxFolderInfo,
	WppOpenAgent,
} from '../../services/wpp-open-agent-updater.service';

const EXTENSION_OPTIONS = [
	{ label: 'PDF (.pdf)', value: 'pdf' },
	{ label: 'Word (.docx)', value: 'docx' },
	{ label: 'PowerPoint (.pptx)', value: 'pptx' },
	{ label: 'Excel (.xlsx)', value: 'xlsx' },
];

const CADENCE_OPTIONS = [{ label: 'Manual', value: 'manual' }];

@Component({
	selector: 'app-wpp-open-agent-updater-task-form',
	standalone: true,
	imports: [
		CommonModule,
		ReactiveFormsModule,
		InputTextModule,
		ButtonModule,
		SelectModule,
		MultiSelectModule,
		ToggleSwitchModule,
		CardModule,
		ToastModule,
		MessageModule,
	],
	providers: [MessageService],
	template: `
		<p-toast />
		<div class="p-4">
			<p-card [header]="isEdit() ? 'Edit Task' : 'New Task'">
				<form [formGroup]="form" (ngSubmit)="onSubmit()">
					<div class="flex flex-col gap-4">
						<!-- Task Name -->
						<div class="flex flex-col gap-2">
							<label for="name">Task Name</label>
							<input
								pInputText
								id="name"
								formControlName="name"
								placeholder="e.g., Weekly Brand Guidelines Sync"
							/>
						</div>

						<!-- Box Folder ID -->
						<div class="flex flex-col gap-2">
							<label for="boxFolderId">Box Folder ID</label>
							<div class="flex gap-2">
								<input
									pInputText
									id="boxFolderId"
									formControlName="boxFolderId"
									placeholder="e.g., 123456789"
									class="grow"
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
									class="mt-1 p-2 rounded"
									style="
										background: var(--p-green-50);
										color: var(--p-green-700);
									"
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
						<div class="flex flex-col gap-2">
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

						<!-- WPP Open Agent -->
						<div class="flex flex-col gap-2">
							<label for="wppOpenAgentId">WPP Open Agent</label>
							@if (agentLoadError()) {
								<p-message
									severity="error"
									[text]="agentLoadError()!"
								/>
							}
							<div class="flex gap-2">
								<p-select
									formControlName="wppOpenAgentId"
									[options]="agents()"
									optionLabel="name"
									optionValue="id"
									placeholder="Select an agent"
									[filter]="true"
									[disabled]="agents().length === 0"
									class="grow"
								/>
								<p-button
									icon="pi pi-refresh"
									[loading]="loadingAgents()"
									(onClick)="loadAgents()"
									[disabled]="
										!form.get('wppOpenProjectId')?.value
									"
									aria-label="Reload agents"
								/>
							</div>
						</div>

						<!-- File Extensions -->
						<div class="flex flex-col gap-2">
							<label for="fileExtensions">File Types</label>
							<p-multiSelect
								formControlName="fileExtensions"
								[options]="extensionOptions"
								optionLabel="label"
								optionValue="value"
								placeholder="Select file types to sync"
								display="chip"
							/>
						</div>

						<!-- Include Subfolders + Cadence -->
						<div class="grid grid-cols-2 gap-4">
							<div class="flex flex-col gap-2">
								<label for="includeSubfolders"
									>Include Subfolders</label
								>
								<p-toggleSwitch
									formControlName="includeSubfolders"
									inputId="includeSubfolders"
								/>
							</div>
							<div class="flex flex-col gap-2">
								<label for="cadence">Run Cadence</label>
								<p-select
									formControlName="cadence"
									[options]="cadenceOptions"
									optionLabel="label"
									optionValue="value"
								/>
							</div>
						</div>

						<!-- Actions -->
						<div class="flex gap-2 justify-end">
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
	private readonly wppOpenService = inject(WppOpenService);
	private readonly messageService = inject(MessageService);
	private readonly destroyRef = inject(DestroyRef);

	readonly extensionOptions = EXTENSION_OPTIONS;
	readonly cadenceOptions = CADENCE_OPTIONS;

	isEdit = signal(false);
	taskId = signal<string | null>(null);
	saving = signal(false);
	validatingFolder = signal(false);
	loadingAgents = signal(false);
	agentLoadError = signal<string | null>(null);
	folderInfo = signal<BoxFolderInfo | null>(null);
	agents = signal<WppOpenAgent[]>([]);

	form: FormGroup = this.fb.group({
		name: ['', Validators.required],
		boxFolderId: ['', Validators.required],
		wppOpenProjectId: ['', Validators.required],
		wppOpenAgentId: ['', Validators.required],
		fileExtensions: [['docx', 'pdf', 'pptx', 'xlsx'], Validators.required],
		includeSubfolders: [true],
		cadence: ['manual'],
	});

	ngOnInit(): void {
		const taskId = this.route.snapshot.paramMap.get('taskId');
		if (taskId) {
			this.isEdit.set(true);
			this.taskId.set(taskId);
			this.loadTask(taskId);
		} else {
			this.autoPopulateFromOsContext();
		}

		this.setupReactiveAgentReload();
	}

	private autoPopulateFromOsContext(): void {
		try {
			const projectId = this.wppOpenService.context?.project?.id;
			if (projectId) {
				this.form.patchValue({ wppOpenProjectId: projectId });
			}
		} catch {
			// Not in iframe — leave blank for manual entry
		}
	}

	private setupReactiveAgentReload(): void {
		this.form
			.get('wppOpenProjectId')!
			.valueChanges.pipe(
				debounceTime(500),
				distinctUntilChanged(),
				filter((value: string) => !!value && value.length >= 8),
				takeUntilDestroyed(this.destroyRef),
			)
			.subscribe(() => {
				this.form.patchValue({ wppOpenAgentId: '' });
				this.agents.set([]);
				this.loadAgents();
			});
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
						fileExtensions: task.fileExtensions,
						includeSubfolders: task.includeSubfolders,
						cadence: task.cadence,
					});

					// Disable core fields in edit mode
					this.form.get('boxFolderId')!.disable();
					this.form.get('wppOpenProjectId')!.disable();
					this.form.get('wppOpenAgentId')!.disable();
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
		const projectId = this.form.get('wppOpenProjectId')?.value;
		if (!projectId) return;

		this.loadingAgents.set(true);
		this.agentLoadError.set(null);

		this.getToken()
			.then((token) => {
				if (!token) {
					this.loadingAgents.set(false);
					this.agentLoadError.set(
						'Could not obtain WPP Open token. Enter project ID and try again.',
					);
					return;
				}

				// Pass osContext for project ID resolution on the backend
				let osContext: unknown;
				try {
					osContext = this.wppOpenService.context;
				} catch {
					// Not in iframe
				}

				this.service
					.listAgents(token, { osContext })
					.pipe(takeUntilDestroyed(this.destroyRef))
					.subscribe({
						next: (result) => {
							this.agents.set(result.agents);
							// Update project ID with the resolved CS project ID
							if (result.resolvedProjectId) {
								this.form.patchValue({
									wppOpenProjectId: result.resolvedProjectId,
								});
							}
							this.loadingAgents.set(false);
						},
						error: () => {
							this.loadingAgents.set(false);
							this.agentLoadError.set(
								'Failed to load agents. Check project ID and try again.',
							);
						},
					});
			})
			.catch(() => {
				this.loadingAgents.set(false);
				this.agentLoadError.set('Could not obtain WPP Open token.');
			});
	}

	private async getToken(): Promise<string | null> {
		try {
			const token = await this.wppOpenService.getAccessToken();
			return token as string;
		} catch {
			return null;
		}
	}

	onSubmit(): void {
		if (this.form.invalid) return;

		this.saving.set(true);
		const value = this.form.getRawValue();

		const selectedAgent = this.agents().find(
			(a) => a.id === value.wppOpenAgentId,
		);

		const request$ = this.isEdit()
			? this.service.updateTask(this.taskId()!, {
					name: value.name,
					fileExtensions: value.fileExtensions,
					includeSubfolders: value.includeSubfolders,
					cadence: value.cadence,
				})
			: this.service.createTask({
					name: value.name,
					boxFolderId: value.boxFolderId,
					wppOpenAgentId: value.wppOpenAgentId,
					wppOpenAgentName: selectedAgent?.name,
					wppOpenProjectId: value.wppOpenProjectId,
					fileExtensions: value.fileExtensions,
					includeSubfolders: value.includeSubfolders,
					cadence: value.cadence,
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
