import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

// Components
import { HeaderComponent } from './components/header/header.component';
import { AccountBarComponent } from './components/header/account-bar/account-bar.component';
import { NavigationBarComponent } from './components/header/navigation-bar/navigation-bar.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';
import { SelectDialogComponent } from './components/select-dialog/select-dialog.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';

// Directives
import { FillHeightDirective } from './directives/fill-height.directive';
import { DropFileDirective } from './directives/drop-file.directive';

// Pipes
import { JoinWithPropPipe } from './pipes/join-with-prop.pipe';
import { SecureRequestPipe } from './pipes/secure-request.pipe';
import { SafeUrlPipe } from './pipes/safe-url.pipe';
import { SafeHtmlPipe } from './pipes/safe-html.pipe';
import { EntityFieldMaskPipe } from './pipes/entity-field-mask.pipe';
import { PluckFromArrayPipe } from './pipes/pluck-from-array.pipe';
import { ShortNumberPipe } from './pipes/short-number.pipe';
import { CoreModule } from '@angular/flex-layout';
import { AngularMaterialModule } from './angular-material.module';

@NgModule({
	declarations: [
		HeaderComponent,
		AccountBarComponent,
		NavigationBarComponent,
		SidebarComponent,
		JoinWithPropPipe,
		ConfirmDialogComponent,
		FillHeightDirective,
		DropFileDirective,
		SecureRequestPipe,
		SafeUrlPipe,
		SafeHtmlPipe,
		EntityFieldMaskPipe,
		PluckFromArrayPipe,
		SelectDialogComponent,
		ShortNumberPipe
	],
	imports: [
		AngularMaterialModule,
		CommonModule,
		RouterModule,
		FormsModule,
		ReactiveFormsModule,
		A11yModule
	],
	exports: [
		HeaderComponent,
		AccountBarComponent,
		NavigationBarComponent,
		SidebarComponent,
		JoinWithPropPipe,
		ConfirmDialogComponent,
		FillHeightDirective,
		DropFileDirective,
		SecureRequestPipe,
		SafeUrlPipe,
		SafeHtmlPipe,
		EntityFieldMaskPipe,
		PluckFromArrayPipe,
		SelectDialogComponent,
		ShortNumberPipe
	]
})
export class SharedModule {}
