import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { PrimeNgModule } from '../../shared/primeng.module';

import { HomeComponent } from './home.page';

@NgModule({
	imports: [
		CommonModule,
		SharedModule,
		PrimeNgModule,
		RouterModule.forChild([
			{
				path: '',
				component: HomeComponent,
			},
		]),
	],
	declarations: [HomeComponent],
})
export class HomePageModule {}
