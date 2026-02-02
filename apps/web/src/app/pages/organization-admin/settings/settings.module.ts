import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule } from '../../../shared/shared.module';
import { PrimeNgModule } from '../../../shared/primeng.module';

import { SettingsPage } from './settings.page';

const routes: Routes = [
	{
		path: '',
		component: SettingsPage,
	},
];

@NgModule({
	imports: [
		CommonModule,
		SharedModule,
		PrimeNgModule,
		RouterModule.forChild(routes),
		SettingsPage,
	],
})
export class SettingsPageModule {}
