import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SharedModule } from '../../shared/shared.module';
import { PrimeNgModule } from '../../shared/primeng.module';

import { SpaceAdminRoutingModule } from './space-admin-routing.module';
import { SpaceAdminPage } from './space-admin.page';

@NgModule({
	imports: [
		CommonModule,
		SharedModule,
		PrimeNgModule,
		SpaceAdminRoutingModule,
		SpaceAdminPage,
	],
})
export class SpaceAdminPageModule {}
