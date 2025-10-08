import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { SpacePage } from './space.page';

const routes: Routes = [
	{
		path: '',
		component: SpacePage
	}
];

@NgModule({
	declarations: [SpacePage],
	imports: [
		CommonModule,
		RouterModule.forChild(routes),
		FormsModule,
		ReactiveFormsModule,
		ToastModule,
		ProgressSpinnerModule
	]
})
export class SpacePageModule {}
