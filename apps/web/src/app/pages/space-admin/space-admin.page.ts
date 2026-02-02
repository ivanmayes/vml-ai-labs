import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';

import { SpaceService } from '../../shared/services/space.service';
import { Space } from '../../shared/models/space.model';
import { environment } from '../../../environments/environment';
import { PrimeNgModule } from '../../shared/primeng.module';

interface MenuItem {
	label: string;
	icon: string;
	routerLink: string;
}

@Component({
	selector: 'app-space-admin',
	templateUrl: './space-admin.page.html',
	styleUrls: ['./space-admin.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, RouterModule, PrimeNgModule],
})
export class SpaceAdminPage implements OnInit {
	sidebarVisible = signal(true);
	spaceId!: string;
	spaceName = signal('Space Admin');
	organizationId: string = environment.organizationId;

	menuItems = signal<MenuItem[]>([
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
	]);

	constructor(
		private route: ActivatedRoute,
		private spaceService: SpaceService,
	) {}

	ngOnInit(): void {
		// Get space ID from route params
		this.route.params.subscribe((params) => {
			this.spaceId = params['id'];
			// Update menu items with the correct routes
			this.menuItems.set([
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
			]);

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
					this.spaceName.set(space.name);
				}
			},
			error: (error) => {
				console.error('Error loading space name:', error);
			},
		});
	}

	toggleSidebar(): void {
		this.sidebarVisible.update((v) => !v);
	}
}
