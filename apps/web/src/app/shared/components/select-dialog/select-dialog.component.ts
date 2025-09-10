import { Component, Inject, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

export interface SelectDialogData {
	title: string;
	placeholder?: string;
	options: Record<string, any>;
	canCancel?: boolean;
}

/**
 * Select Dialog
 * Give the user some options, get result.
 */
@Component({
    selector: 'app-select-dialog',
    templateUrl: './select-dialog.component.html',
    styleUrls: ['./select-dialog.component.scss'],
    standalone: false
})
export class SelectDialogComponent {
	public selection = new FormGroup({
		choice: new FormControl([''], [Validators.required])
	});

	constructor(public dialogRef: MatDialogRef<SelectDialogComponent>, @Inject(MAT_DIALOG_DATA) public data: SelectDialogData) {}

	submit() {
		this.dialogRef.close(this.selection.get('choice').value);
	}

	cancel() {
		this.dialogRef.close();
	}
}
