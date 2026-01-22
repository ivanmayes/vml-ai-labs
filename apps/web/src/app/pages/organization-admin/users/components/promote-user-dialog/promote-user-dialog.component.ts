import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { OrganizationAdminService } from '../../../../../shared/services/organization-admin.service';
import { MessageService } from 'primeng/api';

@Component({
	selector: 'app-promote-user-dialog',
	templateUrl: './promote-user-dialog.component.html',
	
})
export class PromoteUserDialogComponent implements OnInit {
	form: FormGroup;
	loading = false;
	availableRoles: any[] = [];
	user: any;

	constructor(
		private readonly fb: FormBuilder,
		private readonly ref: DynamicDialogRef,
		private readonly config: DynamicDialogConfig,
		private readonly adminService: OrganizationAdminService,
		private readonly messageService: MessageService
	) {}

	ngOnInit(): void {
		this.user = this.config.data?.user;
		this.initForm();
		this.setupAvailableRoles();
	}

	initForm(): void {
		this.form = this.fb.group({
			role: [this.user?.role || '', Validators.required]
		});
	}

	setupAvailableRoles(): void {
		const currentUserRole = this.config.data?.currentUserRole;

		// Only Admin and Super Admin roles
		const allRoles = [
			{ label: 'Admin', value: 'admin' },
			{ label: 'Super Admin', value: 'super-admin' }
		];

		// Filter based on current user's role
		if (currentUserRole === 'super-admin') {
			this.availableRoles = allRoles;
		} else if (currentUserRole === 'admin') {
			// Admins can only assign admin role
			this.availableRoles = allRoles.filter(r => r.value === 'admin');
		} else {
			this.availableRoles = [];
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

		this.adminService.promoteUser(organizationId, {
			userId: this.user.id,
			targetRole: formValue.role
		}).subscribe({
			next: () => {
				this.loading = false;
				this.ref.close(true);
			},
			error: (error) => {
				console.error('Error updating user role:', error);
				this.messageService.add({
					severity: 'error',
					summary: 'Error',
					detail: error.error?.message || 'Failed to update user role',
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
