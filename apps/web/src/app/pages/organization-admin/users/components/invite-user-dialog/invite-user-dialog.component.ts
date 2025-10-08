import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { OrganizationAdminService } from '../../../../../shared/services/organization-admin.service';
import { MessageService } from 'primeng/api';

@Component({
	selector: 'app-invite-user-dialog',
	templateUrl: './invite-user-dialog.component.html',
	standalone: false
})
export class InviteUserDialogComponent implements OnInit {
	form: FormGroup;
	loading: boolean = false;
	availableRoles: any[] = [];

	constructor(
		private readonly fb: FormBuilder,
		private readonly ref: DynamicDialogRef,
		private readonly config: DynamicDialogConfig,
		private readonly adminService: OrganizationAdminService,
		private readonly messageService: MessageService
	) {}

	ngOnInit(): void {
		this.initForm();
		this.setupAvailableRoles();
	}

	initForm(): void {
		this.form = this.fb.group({
			email: ['', [Validators.required, Validators.email]],
			role: ['admin', Validators.required],
			nameFirst: ['', Validators.required],
			nameLast: ['', Validators.required]
		});
	}

	setupAvailableRoles(): void {
		const currentUserRole = this.config.data?.currentUserRole;

		// Define role hierarchy
		const allRoles = [
			{ label: 'Admin', value: 'admin' },
			{ label: 'Super Admin', value: 'super-admin' }
		];

		// Filter roles based on current user's role
		if (currentUserRole === 'super-admin') {
			this.availableRoles = allRoles;
		} else if (currentUserRole === 'admin') {
			this.availableRoles = allRoles.filter(r => r.value === 'admin');
		}
	}

	onSubmit(): void {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		this.loading = true;
		const formValue = this.form.value;
		const organizationId = this.config.data?.organizationId;

		// For now, we'll need to get the auth strategy ID from somewhere
		// This is a simplified version - you might need to fetch this from the org
		const authStrategyId = 'default-strategy-id'; // TODO: Get actual auth strategy

		this.adminService.inviteUser(
			organizationId,
			formValue.email,
			formValue.role,
			authStrategyId,
			{
				nameFirst: formValue.nameFirst,
				nameLast: formValue.nameLast
			}
		).subscribe({
			next: () => {
				this.loading = false;
				this.ref.close(true);
			},
			error: (error) => {
				console.error('Error inviting user:', error);
				this.messageService.add({
					severity: 'error',
					summary: 'Error',
					detail: error.error?.message || 'Failed to invite user',
					life: 3000
				});
				this.loading = false;
			}
		});
	}

	onCancel(): void {
		this.ref.close();
	}
}
