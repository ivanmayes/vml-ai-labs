import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';

import { PrimeNgModule } from '../../primeng.module';

export interface ConfirmDialogData {
	title?: string;
	message?: string;
	confirmWithString?: boolean;
	confirmationString?: string;
	entityName?: string;
	confirm?: string;
}

/**
 * Confirm Dialog
 * Use to confirm a user action.
 * Supports remove, unlink and custom messages
 * Supports type confirmation as well
 */
@Component({
	selector: 'app-confirm-dialog',
	templateUrl: './confirm-dialog.component.html',
	styleUrls: ['./confirm-dialog.component.scss'],
	imports: [CommonModule, ReactiveFormsModule, PrimeNgModule],
})
export class ConfirmDialogComponent {
	confirmation = new FormGroup({
		verifyString: new FormControl(['']),
	});

	public data: ConfirmDialogData;

	constructor(
		public dialogRef: DynamicDialogRef,
		public config: DynamicDialogConfig,
	) {
		this.data = config.data;
	}

	yes() {
		this.dialogRef.close(true);
	}

	no() {
		this.dialogRef.close();
	}

	escapeRegExp(value: string | undefined): string {
		if (!value) return '';
		return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
	}
}
