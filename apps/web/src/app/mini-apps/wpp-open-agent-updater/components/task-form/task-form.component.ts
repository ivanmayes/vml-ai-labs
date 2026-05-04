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
							@if (projectInaccessible()) {
								<p-message
									severity="warn"
									text="This task's saved project is not accessible from your current workspace. Re-point the task to a project here, or open the task in a workspace where you have access to the saved project."
								/>
							}
							<input
								pInputText
								id="wppOpenProjectId"
								formControlName="wppOpenProjectId"
								placeholder="Project ID from WPP Open"
							/>
							@if (
								missingProjectContext() &&
								!form.get('wppOpenProjectId')?.value
							) {
								<p-message
									severity="info"
									text="No project detected. Launch this app from within a WPP Open project to auto-populate this field, or paste the Project ID manually."
								/>
							}
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
							@if (agentMismatch()) {
								@if (agentMismatchReason() === 'no-access') {
									<p-message
										severity="warn"
										text="The selected agent's home project isn't accessible from your current workspace. Switch to a workspace that grants access to that project, or pick a different agent."
									/>
								} @else {
									<p-message
										severity="warn"
										text="The selected agent does not belong to the saved project. Pick a different agent from the dropdown for this project, or change the project ID."
									/>
								}
							}
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
	missingProjectContext = signal(false);
	taskId = signal<string | null>(null);
	saving = signal(false);
	validatingFolder = signal(false);
	loadingAgents = signal(false);
	agentLoadError = signal<string | null>(null);
	// True when the most recent loadAgents() call returned the typed
	// permission error — i.e. the saved project isn't reachable from the
	// current OS context. Drives the workspace-mismatch banner.
	projectInaccessible = signal(false);
	// True when the picked agent fails CS's strict pair check (either
	// because the agent doesn't belong to the project we sent, or because
	// the user lacks access to the agent's home project from the current
	// workspace). Drives an inline warning under the agent dropdown.
	agentMismatch = signal(false);
	// Distinguishes the two failure modes for messaging — both block a
	// successful run, but the remediation is different.
	agentMismatchReason = signal<'mismatch' | 'no-access' | null>(null);
	validatingAgent = signal(false);
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
		this.setupAgentPickValidation();
	}

	// Monotonic sequence used to drop stale validation responses. Without it,
	// rapid agent picks could let an older request overwrite the result of a
	// newer one (e.g. pick A → pick B → A's response arrives last and decides
	// the banner state).
	private validateSeq = 0;

	private setupAgentPickValidation(): void {
		this.form
			.get('wppOpenAgentId')!
			.valueChanges.pipe(
				debounceTime(300),
				distinctUntilChanged(),
				takeUntilDestroyed(this.destroyRef),
			)
			.subscribe((agentId: string) => {
				// Bump the sequence on every emission so any in-flight
				// validation from a prior pick will be ignored when its
				// response arrives.
				this.validateSeq++;
				this.agentMismatch.set(false);
				this.agentMismatchReason.set(null);
				if (!agentId) return;
				// Prefer the agent's own owning project (when CS surfaces it
				// on the listAgents response) — that's what getAgentConfig
				// will accept. Fall back to the form's project for legacy
				// flows where the agent record didn't carry it.
				const picked = this.agents().find((a) => a.id === agentId);
				const projectId =
					picked?.projectId ??
					this.form.get('wppOpenProjectId')?.value;
				if (!projectId) return;
				this.validateAgentPair(this.validateSeq, projectId, agentId);
			});
	}

	private async validateAgentPair(
		seq: number,
		projectId: string,
		agentId: string,
	): Promise<void> {
		const token = await this.getToken();
		if (seq !== this.validateSeq || !token) return;
		let osContext: unknown;
		try {
			osContext = this.wppOpenService.context;
		} catch {
			// Not in iframe
		}

		this.validatingAgent.set(true);
		this.service
			.getAgentConfig(token, projectId, agentId, osContext)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: () => {
					if (seq !== this.validateSeq) return;
					this.agentMismatch.set(false);
					this.agentMismatchReason.set(null);
					this.validatingAgent.set(false);
				},
				error: (err) => {
					if (seq !== this.validateSeq) return;
					this.validatingAgent.set(false);
					const code = err?.error?.code ?? err?.error?.error?.code;
					if (
						err?.status === 400 &&
						code ===
							'ACCESS_LAYER_AGENT_CONFIG_DOES_NOT_BELONG_TO_PROJECT'
					) {
						this.agentMismatch.set(true);
						this.agentMismatchReason.set('mismatch');
					} else if (
						err?.status === 403 &&
						code ===
							'ACCESS_LAYER_MISSING_PERMISSIONS_TO_EXTERNAL_PROJECT'
					) {
						// User picked an agent whose home project they
						// don't have access to from the current workspace.
						// CS returned this exact code; surface it instead
						// of letting the run discover it later.
						this.agentMismatch.set(true);
						this.agentMismatchReason.set('no-access');
					}
					// Other errors (network, transient 5xx) silently dropped —
					// the worker will surface them at run time.
				},
			});
	}

	private autoPopulateFromOsContext(): void {
		try {
			const projectId = this.wppOpenService.context?.project?.id;
			if (!projectId) {
				this.missingProjectContext.set(true);
				return;
			}
			// `osContext.project.id` is the WPP Open *workspace* UUID — CS's
			// `listAgents` endpoint rejects that with PROJECT_NOT_FOUND. The
			// CS-internal projectId is what we actually need. Trigger a
			// listAgents call with no projectId (osContext only); the backend
			// resolves and returns `resolvedProjectId`, which loadAgents'
			// response handler patches into the form.
			this.loadAgents();
		} catch {
			// Not in iframe — leave blank for manual entry
		}
	}

	// One-shot suppression: when loadTask patches the form on Edit open, the
	// project field's valueChanges fires and the reactive-reload would
	// otherwise clear the saved agent. We want the saved agent to remain
	// selected. The flag tells the next reactive-reload tick to skip the
	// clear and just re-populate the agent list.
	private suppressAgentClearOnce = false;

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
				if (this.suppressAgentClearOnce) {
					this.suppressAgentClearOnce = false;
					this.loadAgents();
					return;
				}
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
					// Tell the next reactive-reload to keep the saved agent
					// instead of clearing it (the project hasn't changed —
					// it just got populated for the first time).
					this.suppressAgentClearOnce = true;
					this.form.patchValue({
						name: task.name,
						boxFolderId: task.boxFolderId,
						wppOpenProjectId: task.wppOpenProjectId,
						wppOpenAgentId: task.wppOpenAgentId,
						fileExtensions: task.fileExtensions,
						includeSubfolders: task.includeSubfolders,
						cadence: task.cadence,
					});

					// Box folder is the task's identity and is immutable.
					// Project + agent stay editable so a task can be re-pointed
					// to a different agent or workspace.
					this.form.get('boxFolderId')!.disable();
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
		const formProjectId = this.form.get('wppOpenProjectId')?.value;

		// Read osContext early — needed both as the create-mode fallback
		// (when the form has no projectId yet) and for the header builder
		// in every call.
		let osContext: unknown;
		try {
			osContext = this.wppOpenService.context;
		} catch {
			// Not in iframe
		}

		// In create mode the form's projectId starts empty — the backend
		// resolves osContext to a CS-internal id and returns it as
		// `resolvedProjectId`. We rely on that path here. If neither
		// projectId nor osContext is available, there's nothing to do.
		if (!formProjectId && !osContext) return;

		this.loadingAgents.set(true);
		this.agentLoadError.set(null);
		this.projectInaccessible.set(false);

		this.getToken()
			.then((token) => {
				if (!token) {
					this.loadingAgents.set(false);
					this.agentLoadError.set(
						'Could not obtain WPP Open token. Enter project ID and try again.',
					);
					return;
				}

				this.service
					.listAgents(token, {
						projectId: formProjectId || undefined,
						osContext,
					})
					.pipe(takeUntilDestroyed(this.destroyRef))
					.subscribe({
						next: (result) => {
							this.agents.set(result.agents);
							// Safe-overwrite: only patch when the form was
							// EMPTY (create-mode auto-populate path). Edit-mode
							// loads the saved CS-internal id from the task and
							// must NOT be silently swapped (the U3 trap).
							if (!formProjectId && result.resolvedProjectId) {
								this.form.patchValue(
									{
										wppOpenProjectId:
											result.resolvedProjectId,
									},
									{ emitEvent: false },
								);
							}
							this.loadingAgents.set(false);
						},
						error: (err) => {
							this.loadingAgents.set(false);
							// 403 with the access-layer code means the saved project
							// isn't reachable from this workspace. The error response
							// body carries `code: ACCESS_LAYER_MISSING_PERMISSIONS_TO_EXTERNAL_PROJECT`.
							const code =
								err?.error?.code ?? err?.error?.error?.code;
							if (
								err?.status === 403 &&
								code ===
									'ACCESS_LAYER_MISSING_PERMISSIONS_TO_EXTERNAL_PROJECT'
							) {
								this.projectInaccessible.set(true);
							} else {
								this.agentLoadError.set(
									'Failed to load agents. Check project ID and try again.',
								);
							}
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

	async onSubmit(): Promise<void> {
		if (this.form.invalid) return;

		this.saving.set(true);
		const value = this.form.getRawValue();

		const selectedAgent = this.agents().find(
			(a) => a.id === value.wppOpenAgentId,
		);

		// osContext + token are sent so the backend can resolve and persist
		// the agent's CS-internal owning project (`wppOpenAgentProjectId`).
		// Best-effort: if either is unavailable (standalone dev mode), the
		// backend stores null and the worker falls back to wppOpenProjectId.
		const wppOpenToken = (await this.getToken()) ?? undefined;
		let osContext: unknown;
		try {
			osContext = this.wppOpenService.context;
		} catch {
			// Not in iframe
		}

		// If CS gave us the agent's owning project on `listAgents`, send it
		// directly. The backend prefers it over its own osContext-resolution
		// fallback so the saved value reflects WHERE THE AGENT LIVES, not
		// where the user happens to be when saving.
		const wppOpenAgentProjectId = selectedAgent?.projectId;

		const request$ = this.isEdit()
			? this.service.updateTask(this.taskId()!, {
					name: value.name,
					fileExtensions: value.fileExtensions,
					includeSubfolders: value.includeSubfolders,
					cadence: value.cadence,
					wppOpenProjectId: value.wppOpenProjectId,
					wppOpenAgentId: value.wppOpenAgentId,
					wppOpenAgentName: selectedAgent?.name,
					wppOpenAgentProjectId,
					wppOpenToken,
					osContext,
				})
			: this.service.createTask({
					name: value.name,
					boxFolderId: value.boxFolderId,
					wppOpenAgentId: value.wppOpenAgentId,
					wppOpenAgentName: selectedAgent?.name,
					wppOpenProjectId: value.wppOpenProjectId,
					wppOpenAgentProjectId,
					fileExtensions: value.fileExtensions,
					includeSubfolders: value.includeSubfolders,
					cadence: value.cadence,
					wppOpenToken,
					osContext,
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
