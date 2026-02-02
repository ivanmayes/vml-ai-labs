import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
	FormBuilder,
	FormGroup,
	ReactiveFormsModule,
	Validators,
} from '@angular/forms';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';

import { SpaceRole } from '../../../../../shared/models/space-role.enum';
import { SpaceUser } from '../../../../../shared/models/space-user.model';
import { PrimeNgModule } from '../../../../../shared/primeng.module';

@Component({
	selector: 'app-change-role-dialog',
	templateUrl: './change-role-dialog.component.html',
	styleUrls: ['./change-role-dialog.component.scss'],
	imports: [CommonModule, ReactiveFormsModule, PrimeNgModule],
})
export class ChangeRoleDialogComponent implements OnInit {
	roleForm: FormGroup;
	user!: SpaceUser;
	roles = [
		{ label: 'Admin', value: SpaceRole.SpaceAdmin },
		{ label: 'User', value: SpaceRole.SpaceUser },
	];
	loading = false;

	constructor(
		private fb: FormBuilder,
		public ref: DynamicDialogRef,
		public config: DynamicDialogConfig,
	) {
		this.roleForm = this.fb.group({
			role: ['', Validators.required],
		});
	}

	ngOnInit(): void {
		// Get user from config data
		if (this.config.data?.user) {
			this.user = this.config.data.user;
			this.roleForm.patchValue({
				role: this.user.role,
			});
		}
	}

	onCancel(): void {
		this.ref.close();
	}

	onSave(): void {
		if (this.roleForm.valid) {
			this.ref.close(this.roleForm.value);
		}
	}

	getUserDisplay(): string {
		if (this.user?.user) {
			return this.user.user.email;
		}
		return '';
	}
}
