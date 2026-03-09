import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { PrimeNgModule } from '../../shared/primeng.module';

import { ProjectComponent } from './project.component';

@NgModule({
	imports: [
		CommonModule,
		SharedModule,
		PrimeNgModule,
		RouterModule.forChild([
			{
				path: '',
				component: ProjectComponent,
			},
		]),
		ProjectComponent,
	],
})
export class ProjectModule {}
