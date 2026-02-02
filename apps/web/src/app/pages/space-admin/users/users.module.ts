import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule } from '../../../shared/shared.module';
import { PrimeNgModule } from '../../../shared/primeng.module';

import { UsersPage } from './users.page';
import { InviteUserDialogComponent } from './components/invite-user-dialog/invite-user-dialog.component';
import { ChangeRoleDialogComponent } from './components/change-role-dialog/change-role-dialog.component';

const routes: Routes = [
	{
		path: '',
		component: UsersPage,
	},
];

@NgModule({
	imports: [
		CommonModule,
		SharedModule,
		PrimeNgModule,
		RouterModule.forChild(routes),
	],
	declarations: [
		UsersPage,
		InviteUserDialogComponent,
		ChangeRoleDialogComponent,
	],
})
export class UsersPageModule {}
