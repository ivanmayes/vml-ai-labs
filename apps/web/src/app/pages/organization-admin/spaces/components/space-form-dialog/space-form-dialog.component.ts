import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { SpaceService } from '../../../../../shared/services/space.service';
import { MessageService } from 'primeng/api';

@Component({
	selector: 'app-space-form-dialog',
	templateUrl: './space-form-dialog.component.html',
	standalone: false
})
export class SpaceFormDialogComponent implements OnInit {
	form: FormGroup;
	loading: boolean = false;
	mode: 'create' | 'edit' = 'create';

	constructor(
		private readonly fb: FormBuilder,
		private readonly ref: DynamicDialogRef,
		private readonly config: DynamicDialogConfig,
		private readonly spaceService: SpaceService,
		private readonly messageService: MessageService
	) {}

	ngOnInit(): void {
		this.mode = this.config.data?.mode || 'create';
		this.initForm();
	}

	initForm(): void {
		const space = this.config.data?.space;

		this.form = this.fb.group({
			name: [space?.name || '', [Validators.required, Validators.minLength(2)]]
		});
	}

	onSubmit(): void {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		this.loading = true;
		const organizationId = this.config.data?.organizationId;
		const formValue = this.form.value;

		if (this.mode === 'create') {
			this.spaceService.createSpace(organizationId, formValue)
				.subscribe({
					next: () => {
						this.loading = false;
						this.ref.close(true);
					},
					error: (error) => {
						console.error('Error creating space:', error);
						this.messageService.add({
							severity: 'error',
							summary: 'Error',
							detail: error.error?.message || 'Failed to create space',
							life: 3000
						});
						this.loading = false;
					}
				});
		} else {
			const spaceId = this.config.data?.space?.id;
			this.spaceService.updateSpace(organizationId, spaceId, formValue)
				.subscribe({
					next: () => {
						this.loading = false;
						this.ref.close(true);
					},
					error: (error) => {
						console.error('Error updating space:', error);
						this.messageService.add({
							severity: 'error',
							summary: 'Error',
							detail: error.error?.message || 'Failed to update space',
							life: 3000
						});
						this.loading = false;
					}
				});
		}
	}

	onCancel(): void {
		this.ref.close();
	}
}
