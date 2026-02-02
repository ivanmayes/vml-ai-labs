import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
	FormControl,
	FormGroup,
	ReactiveFormsModule,
	Validators,
} from '@angular/forms';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';

import { PrimeNgModule } from '../../primeng.module';

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
	imports: [CommonModule, ReactiveFormsModule, PrimeNgModule],
})
export class SelectDialogComponent {
	public selection = new FormGroup({
		choice: new FormControl([''], [Validators.required]),
	});

	public data: SelectDialogData;

	constructor(
		public dialogRef: DynamicDialogRef,
		public config: DynamicDialogConfig,
	) {
		this.data = config.data;
	}

	submit() {
		this.dialogRef.close(this.selection.get('choice')?.value);
	}

	cancel() {
		this.dialogRef.close();
	}
}
