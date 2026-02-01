import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { SharedModule } from '../../shared/shared.module';
import { PrimeNgModule } from '../../shared/primeng.module';

import { BasicAuthComponent } from './basic/basic.component';
import { LoginComponent } from './login.page';
import { OktaAuthComponent } from './okta/okta.component';

@NgModule({
	imports: [
		CommonModule,
		FormsModule,
		SharedModule,
		ReactiveFormsModule,
		PrimeNgModule,
		RouterModule.forChild([
			{
				path: '',
				component: LoginComponent,
			},
		]),
	],
	declarations: [LoginComponent, BasicAuthComponent, OktaAuthComponent],
})
export class LoginPageModule {}
