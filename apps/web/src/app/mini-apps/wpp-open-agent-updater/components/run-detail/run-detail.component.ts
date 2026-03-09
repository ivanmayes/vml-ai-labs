import {
	Component,
	signal,
	inject,
	OnInit,
	OnDestroy,
	DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ProgressBarModule } from 'primeng/progressbar';

import {
	WppOpenAgentUpdaterService,
	TaskRun,
} from '../../services/wpp-open-agent-updater.service';

@Component({
	selector: 'app-wpp-open-agent-updater-run-detail',
	standalone: true,
	imports: [
		CommonModule,
		TagModule,
		ButtonModule,
		CardModule,
		ProgressBarModule,
	],
	template: `
		<div class="p-4">
			@if (run()) {
				<div
					class="flex justify-content-between align-items-center mb-4"
				>
					<div>
						<h2 class="m-0">Run Details</h2>
						<p class="text-color-secondary mt-1 mb-0">
							Started: {{ run()!.createdAt | date: 'medium' }}
						</p>
					</div>
					<div class="flex gap-2 align-items-center">
						<p-tag
							[value]="run()!.status"
							[severity]="getRunStatusSeverity(run()!.status)"
						/>
						<p-button
							icon="pi pi-arrow-left"
							label="Back"
							[text]="true"
							(onClick)="goBack()"
						/>
					</div>
				</div>

				<!-- Summary Cards -->
				<div class="grid mb-4">
					<div class="col-12 md:col-3">
						<p-card>
							<div class="text-center">
								<div
									class="text-3xl font-bold"
									style="color: var(--p-primary-color)"
								>
									{{ run()!.filesFound }}
								</div>
								<div class="text-color-secondary mt-1">
									Files Found
								</div>
							</div>
						</p-card>
					</div>
					<div class="col-12 md:col-3">
						<p-card>
							<div class="text-center">
								<div
									class="text-3xl font-bold"
									style="color: var(--p-green-500)"
								>
									{{ run()!.filesProcessed }}
								</div>
								<div class="text-color-secondary mt-1">
									Processed
								</div>
							</div>
						</p-card>
					</div>
					<div class="col-12 md:col-3">
						<p-card>
							<div class="text-center">
								<div
									class="text-3xl font-bold"
									style="color: var(--p-red-500)"
								>
									{{ run()!.filesFailed }}
								</div>
								<div class="text-color-secondary mt-1">
									Failed
								</div>
							</div>
						</p-card>
					</div>
					<div class="col-12 md:col-3">
						<p-card>
							<div class="text-center">
								<div
									class="text-3xl font-bold"
									style="color: var(--p-yellow-500)"
								>
									{{ run()!.filesSkipped }}
								</div>
								<div class="text-color-secondary mt-1">
									Skipped
								</div>
							</div>
						</p-card>
					</div>
				</div>

				@if (run()!.status === 'processing' && run()!.filesFound > 0) {
					<p-progressBar [value]="getProgress()" class="mb-4" />
				}

				@if (run()!.errorMessage) {
					<div
						class="p-3 mb-4 border-round"
						style="background: var(--p-red-50); color: var(--p-red-700)"
					>
						<i class="pi pi-exclamation-triangle mr-2"></i>
						{{ run()!.errorMessage }}
					</div>
				}
			}
		</div>
	`,
})
export class RunDetailComponent implements OnInit, OnDestroy {
	readonly router = inject(Router);
	private readonly route = inject(ActivatedRoute);
	private readonly service = inject(WppOpenAgentUpdaterService);
	private readonly destroyRef = inject(DestroyRef);

	run = signal<TaskRun | null>(null);

	private runId = '';
	private pollInterval: ReturnType<typeof setInterval> | null = null;

	ngOnInit(): void {
		this.runId = this.route.snapshot.paramMap.get('runId') || '';
		this.loadRun();
	}

	ngOnDestroy(): void {
		this.stopPolling();
	}

	loadRun(): void {
		this.service
			.getRun(this.runId)
			.pipe(takeUntilDestroyed(this.destroyRef))
			.subscribe({
				next: (run) => {
					this.run.set(run);
					if (
						run.status === 'processing' ||
						run.status === 'pending'
					) {
						this.startPolling();
					} else {
						this.stopPolling();
					}
				},
				error: () => {
					this.stopPolling();
				},
			});
	}

	getProgress(): number {
		const r = this.run();
		if (!r || r.filesFound === 0) return 0;
		return Math.round(
			((r.filesProcessed + r.filesFailed + r.filesSkipped) /
				r.filesFound) *
				100,
		);
	}

	goBack(): void {
		const r = this.run();
		if (r?.taskId) {
			this.router.navigate(['apps/wpp-open-agent-updater', r.taskId]);
		} else {
			this.router.navigate(['apps/wpp-open-agent-updater']);
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

	private startPolling(): void {
		if (this.pollInterval) return;
		this.pollInterval = setInterval(() => this.loadRun(), 5000);
	}

	private stopPolling(): void {
		if (this.pollInterval) {
			clearInterval(this.pollInterval);
			this.pollInterval = null;
		}
	}
}
