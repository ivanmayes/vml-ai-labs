import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared.module';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@NgModule({
	declarations: [
	],
	imports: [CommonModule, RouterModule, FormsModule, SharedModule, MatButtonModule, MatSnackBarModule],
	providers: [MatSnackBar],
	exports: [
	]
})
export class GlobalModule {}
