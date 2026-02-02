import { Component } from '@angular/core';

@Component({
	selector: 'app-organization-admin',

	templateUrl: './organization-admin.page.html',
	styleUrls: ['./organization-admin.page.scss'],
})
export class OrganizationAdminPage {
	sidebarVisible = true;

	menuItems = [
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
		this.sidebarVisible = !this.sidebarVisible;
	}
}
