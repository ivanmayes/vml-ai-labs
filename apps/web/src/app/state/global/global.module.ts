import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
	declarations: [
	],
	imports: [CommonModule, RouterModule, FormsModule, SharedModule],
	providers: [],
	exports: [
	]
})
export class GlobalModule {}
