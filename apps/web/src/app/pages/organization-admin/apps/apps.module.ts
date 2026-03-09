import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';

import { SharedModule } from '../../../shared/shared.module';
import { PrimeNgModule } from '../../../shared/primeng.module';

import { AppsPage } from './apps.page';

const routes: Routes = [
	{
		path: '',
		component: AppsPage,
	},
];

@NgModule({
	imports: [
		CommonModule,
		SharedModule,
		PrimeNgModule,
		RouterModule.forChild(routes),
		AppsPage,
	],
})
export class AppsPageModule {}
