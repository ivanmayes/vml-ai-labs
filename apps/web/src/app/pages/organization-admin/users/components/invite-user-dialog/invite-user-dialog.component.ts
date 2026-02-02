import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { MessageService } from 'primeng/api';

import { OrganizationAdminService } from '../../../../../shared/services/organization-admin.service';

@Component({
	selector: 'app-invite-user-dialog',

	templateUrl: './invite-user-dialog.component.html',
})
export class InviteUserDialogComponent implements OnInit {
	form!: FormGroup;
	loading = false;
	availableRoles: any[] = [];

	constructor(
		private readonly fb: FormBuilder,
		private readonly ref: DynamicDialogRef,
		private readonly config: DynamicDialogConfig,
		private readonly adminService: OrganizationAdminService,
		private readonly messageService: MessageService,
	) {}

	ngOnInit(): void {
		this.initForm();
		this.setupAvailableRoles();
	}

	initForm(): void {
		this.form = this.fb.group({
			email: ['', [Validators.required, Validators.email]],
			role: ['user', Validators.required],
			nameFirst: ['', Validators.required],
			nameLast: ['', Validators.required],
		});
	}

	setupAvailableRoles(): void {
		const currentUserRole = this.config.data?.currentUserRole;

		// Define all roles in hierarchy order (highest to lowest privilege)
		// Role index determines what each role can assign (can only assign roles at same level or below)
		const allRoles = [
			{ label: 'Super Admin', value: 'super-admin', index: 0 },
			{ label: 'Admin', value: 'admin', index: 1 },
			{ label: 'Manager', value: 'manager', index: 2 },
			{ label: 'User', value: 'user', index: 3 },
			{ label: 'Guest', value: 'guest', index: 4 },
		];

		// Map current user role to index
		const roleIndex =
			allRoles.find((r) => r.value === currentUserRole)?.index ?? 999;

		// Filter to roles the current user can assign (same level or below)
		this.availableRoles = allRoles
			.filter((r) => r.index >= roleIndex)
			.map(({ label, value }) => ({ label, value }));
	}

	onSubmit(): void {
		if (this.form.invalid) {
			this.form.markAllAsTouched();
			return;
		}

		this.loading = true;
		const formValue = this.form.value;
		const organizationId = this.config.data?.organizationId;

		// Invite the user - backend will auto-select auth strategy if not provided
		this.adminService
			.inviteUser(
				organizationId,
				formValue.email,
				formValue.role,
				undefined, // Let backend pick auth strategy
				{
					nameFirst: formValue.nameFirst,
					nameLast: formValue.nameLast,
				},
			)
			.subscribe({
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
						life: 3000,
					});
					this.loading = false;
				},
			});
	}

	onCancel(): void {
		this.ref.close();
	}
}
