import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../../shared/shared.module';
import { HomeComponent } from './home.page';
import { RouterModule } from '@angular/router';

@NgModule({
	imports: [
		CommonModule,
		SharedModule,
		RouterModule.forChild([
			{
				path: '',
				component: HomeComponent
			}
		])
	],
	declarations: [HomeComponent]
})
export class HomePageModule {}
