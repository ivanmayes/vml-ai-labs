import { Component, OnInit } from '@angular/core';
import { MessageService } from 'primeng/api';
import { OrganizationAdminService } from '../../../shared/services/organization-admin.service';
import { environment } from '../../../../environments/environment';

@Component({
	selector: 'app-settings',
	templateUrl: './settings.page.html',
	styleUrls: ['./settings.page.scss'],
	
})
export class SettingsPage implements OnInit {
	loading = false;
	saving = false;
	organizationId: string;
	organizationName = '';
	originalOrganizationName = '';
	redirectToSpace = false;

	constructor(
		private readonly organizationService: OrganizationAdminService,
		private readonly messageService: MessageService
	) {}

	ngOnInit(): void {
		this.organizationId = environment.organizationId;
		if (this.organizationId) {
			this.loadSettings();
		}
	}

	loadSettings(): void {
		this.loading = true;
		this.organizationService.getOrganization(this.organizationId)
			.subscribe({
				next: (response) => {
					this.organizationName = response.data?.name || '';
					this.originalOrganizationName = response.data?.name || '';
					this.redirectToSpace = response.data?.redirectToSpace || false;
					this.loading = false;
				},
				error: (error) => {
					console.error('Error loading settings:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to load organization settings',
						life: 3000
					});
					this.loading = false;
				}
			});
	}

	onOrganizationNameChange(): void {
		this.saving = true;
		this.organizationService.updateOrganization(this.organizationId, {
			name: this.organizationName
		})
			.subscribe({
				next: () => {
					this.originalOrganizationName = this.organizationName;
					this.messageService.add({
						severity: 'success',
						summary: 'Success',
						detail: 'Organization name updated successfully',
						life: 3000
					});
					this.saving = false;
				},
				error: (error) => {
					console.error('Error updating organization name:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to update organization name',
						life: 3000
					});
					this.saving = false;
				}
			});
	}

	onRedirectToSpaceChange(): void {
		this.saving = true;
		this.organizationService.updateOrganization(this.organizationId, {
			redirectToSpace: this.redirectToSpace
		})
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'success',
						summary: 'Success',
						detail: 'Settings updated successfully',
						life: 3000
					});
					this.saving = false;
				},
				error: (error) => {
					console.error('Error updating settings:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to update settings',
						life: 3000
					});
					this.saving = false;
				}
			});
	}
}
