import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { SpaceService } from '../../shared/services/space.service';
import { Space } from '../../shared/models/space.model';
import { environment } from '../../../environments/environment';

@Component({
	selector: 'app-space-admin',
	templateUrl: './space-admin.page.html',
	styleUrls: ['./space-admin.page.scss'],
})
export class SpaceAdminPage implements OnInit {
	sidebarVisible = true;
	spaceId!: string;
	spaceName = 'Space Admin';
	organizationId: string = environment.organizationId;

	menuItems = [
		{
			label: 'Settings',
			icon: 'pi pi-cog',
			routerLink: '',
		},
		{
			label: 'Users',
			icon: 'pi pi-users',
			routerLink: '',
		},
	];

	constructor(
		private route: ActivatedRoute,
		private spaceService: SpaceService,
	) {}

	ngOnInit(): void {
		// Get space ID from route params
		this.route.params.subscribe((params) => {
			this.spaceId = params['id'];
			// Update menu items with the correct routes
			this.menuItems = [
				{
					label: 'Settings',
					icon: 'pi pi-cog',
					routerLink: `/space/${this.spaceId}/admin/settings`,
				},
				{
					label: 'Users',
					icon: 'pi pi-users',
					routerLink: `/space/${this.spaceId}/admin/users`,
				},
			];

			// Load space details
			this.loadSpaceName();
		});
	}

	loadSpaceName(): void {
		this.spaceService.getSpaces(this.organizationId).subscribe({
			next: (response) => {
				const space = response.data?.find(
					(s: Space) => s.id === this.spaceId,
				);
				if (space) {
					this.spaceName = space.name;
				}
			},
			error: (error) => {
				console.error('Error loading space name:', error);
			},
		});
	}

	toggleSidebar(): void {
		this.sidebarVisible = !this.sidebarVisible;
	}
}
