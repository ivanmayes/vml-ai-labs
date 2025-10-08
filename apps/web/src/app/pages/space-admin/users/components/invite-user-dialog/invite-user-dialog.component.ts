import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { SpaceRole } from '../../../../../shared/models/space-role.enum';

@Component({
	selector: 'app-invite-user-dialog',
	templateUrl: './invite-user-dialog.component.html',
	styleUrls: ['./invite-user-dialog.component.scss'],
	standalone: false
})
export class InviteUserDialogComponent implements OnInit {
	inviteForm: FormGroup;
	roles = [
		{ label: 'Admin', value: SpaceRole.SpaceAdmin },
		{ label: 'User', value: SpaceRole.SpaceUser }
	];
	loading = false;

	constructor(
		private fb: FormBuilder,
		public ref: DynamicDialogRef,
		public config: DynamicDialogConfig
	) {
		this.inviteForm = this.fb.group({
			email: ['', [Validators.required, Validators.email]],
			role: [SpaceRole.SpaceUser, Validators.required]
		});
	}

	ngOnInit(): void {
		// Component initialized
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
