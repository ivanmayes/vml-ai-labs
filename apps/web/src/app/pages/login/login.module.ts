import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../../shared/shared.module';
import { RouterModule } from '@angular/router';
import { BasicAuthComponent } from './basic/basic.component';
import { LoginComponent } from './login.page';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FlexLayoutModule } from '@angular/flex-layout';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { OktaAuthComponent } from './okta/okta.component';

@NgModule({
	imports: [
		CommonModule,
		FormsModule,
		SharedModule,
		ReactiveFormsModule,
		FlexLayoutModule,
		MatButtonModule,
		MatInputModule,
		MatDatepickerModule,
		MatProgressSpinnerModule,
		MatButtonToggleModule,
		MatSelectModule,
		MatIconModule,
		MatSelectModule,
		MatIconModule,
		RouterModule.forChild([
			{
				path: '',
				component: LoginComponent
			}
		])
	],
	declarations: [LoginComponent, BasicAuthComponent, OktaAuthComponent]
})
export class LoginPageModule {}
