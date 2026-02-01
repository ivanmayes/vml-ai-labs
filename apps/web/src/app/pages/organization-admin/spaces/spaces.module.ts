import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { SharedModule } from '../../../shared/shared.module';
import { PrimeNgModule } from '../../../shared/primeng.module';

import { SpacesPage } from './spaces.page';
import { SpaceFormDialogComponent } from './components/space-form-dialog/space-form-dialog.component';

// PrimeNG additional imports

@NgModule({
	imports: [
		CommonModule,
		ReactiveFormsModule,
		SharedModule,
		PrimeNgModule,
		ConfirmDialogModule,
		RouterModule.forChild([
			{
				path: '',
				component: SpacesPage,
			},
		]),
	],
	declarations: [SpacesPage, SpaceFormDialogComponent],
})
export class SpacesPageModule {}
