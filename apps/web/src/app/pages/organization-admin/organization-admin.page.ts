import { Component, OnInit } from '@angular/core';

@Component({
	selector: 'app-organization-admin',
	templateUrl: './organization-admin.page.html',
	styleUrls: ['./organization-admin.page.scss'],
	standalone: false
})
export class OrganizationAdminPage implements OnInit {
	sidebarVisible: boolean = true;

	menuItems = [
		{
			label: 'Users',
			icon: 'pi pi-users',
			routerLink: '/organization/admin/users'
		},
		{
			label: 'Spaces',
			icon: 'pi pi-th-large',
			routerLink: '/organization/admin/spaces'
		}
	];

	constructor() {}

	ngOnInit(): void {}

	toggleSidebar(): void {
		this.sidebarVisible = !this.sidebarVisible;
	}
}
