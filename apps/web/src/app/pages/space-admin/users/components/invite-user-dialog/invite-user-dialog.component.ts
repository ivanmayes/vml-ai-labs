import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
	FormBuilder,
	FormGroup,
	ReactiveFormsModule,
	Validators,
} from '@angular/forms';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';

import { SpaceRole } from '../../../../../shared/models/space-role.enum';
import { PrimeNgModule } from '../../../../../shared/primeng.module';

@Component({
	selector: 'app-invite-user-dialog',
	templateUrl: './invite-user-dialog.component.html',
	styleUrls: ['./invite-user-dialog.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, ReactiveFormsModule, PrimeNgModule],
})
export class InviteUserDialogComponent {
	inviteForm: FormGroup;
	roles = [
		{ label: 'Admin', value: SpaceRole.SpaceAdmin },
		{ label: 'User', value: SpaceRole.SpaceUser },
	];
	loading = signal(false);

	constructor(
		private fb: FormBuilder,
		public ref: DynamicDialogRef,
		public config: DynamicDialogConfig,
	) {
		this.inviteForm = this.fb.group({
			email: ['', [Validators.required, Validators.email]],
			role: [SpaceRole.SpaceUser, Validators.required],
		});
	}

	onCancel(): void {
		this.ref.close();
	}

	onInvite(): void {
		if (this.inviteForm.valid) {
			this.ref.close(this.inviteForm.value);
		}
	}
}
