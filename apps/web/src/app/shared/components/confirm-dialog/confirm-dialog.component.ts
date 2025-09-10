import { Component, Inject, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

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
    standalone: false
})
export class ConfirmDialogComponent {
	confirmation = new FormGroup({
		verifyString: new FormControl([''])
	});

	constructor(public dialogRef: MatDialogRef<ConfirmDialogComponent>, @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData) {}

	yes() {
		this.dialogRef.close(true);
	}

	no() {
		this.dialogRef.close();
	}

	escapeRegExp(string) {
		return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
	}
}
