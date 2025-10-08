import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../../shared/shared.module';
import { PrimeNgModule } from '../../shared/primeng.module';
import { OrganizationAdminRoutingModule } from './organization-admin-routing.module';
import { OrganizationAdminPage } from './organization-admin.page';

@NgModule({
	imports: [
		CommonModule,
		SharedModule,
		PrimeNgModule,
		OrganizationAdminRoutingModule
	],
	declarations: [OrganizationAdminPage]
})
export class OrganizationAdminModule {}
