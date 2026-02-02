import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { SharedModule } from '../../../shared/shared.module';
import { PrimeNgModule } from '../../../shared/primeng.module';

import { UsersPage } from './users.page';
import { InviteUserDialogComponent } from './components/invite-user-dialog/invite-user-dialog.component';
import { PromoteUserDialogComponent } from './components/promote-user-dialog/promote-user-dialog.component';

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
				component: UsersPage,
			},
		]),
		UsersPage,
		InviteUserDialogComponent,
		PromoteUserDialogComponent,
	],
})
export class UsersPageModule {}
