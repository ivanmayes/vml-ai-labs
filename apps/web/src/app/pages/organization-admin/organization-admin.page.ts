import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { PrimeNgModule } from '../../shared/primeng.module';

@Component({
	selector: 'app-organization-admin',
	templateUrl: './organization-admin.page.html',
	styleUrls: ['./organization-admin.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, RouterModule, PrimeNgModule],
})
export class OrganizationAdminPage {
	sidebarVisible = signal(true);

	readonly menuItems = [
		{
			label: 'Users',
			icon: 'pi pi-users',
			routerLink: '/organization/admin/users',
		},
		{
			label: 'Spaces',
			icon: 'pi pi-th-large',
			routerLink: '/organization/admin/spaces',
		},
		{
			label: 'Settings',
			icon: 'pi pi-cog',
			routerLink: '/organization/admin/settings',
		},
	];

	toggleSidebar(): void {
		this.sidebarVisible.update((v) => !v);
	}
}
