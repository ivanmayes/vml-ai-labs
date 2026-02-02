import {
	ChangeDetectionStrategy,
	Component,
	OnInit,
	signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';

import { OrganizationAdminService } from '../../../shared/services/organization-admin.service';
import { environment } from '../../../../environments/environment';
import { PrimeNgModule } from '../../../shared/primeng.module';

@Component({
	selector: 'app-settings',
	templateUrl: './settings.page.html',
	styleUrls: ['./settings.page.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, FormsModule, PrimeNgModule],
})
export class SettingsPage implements OnInit {
	loading = signal(false);
	saving = signal(false);
	organizationId!: string;
	organizationName = signal('');
	originalOrganizationName = signal('');
	redirectToSpace = signal(false);

	constructor(
		private readonly organizationService: OrganizationAdminService,
		private readonly messageService: MessageService,
	) {}

	ngOnInit(): void {
		this.organizationId = environment.organizationId;
		if (this.organizationId) {
			this.loadSettings();
		}
	}

	loadSettings(): void {
		this.loading.set(true);
		this.organizationService
			.getOrganization(this.organizationId)
			.subscribe({
				next: (response) => {
					this.organizationName.set(response.data?.name || '');
					this.originalOrganizationName.set(
						response.data?.name || '',
					);
					this.redirectToSpace.set(
						response.data?.redirectToSpace || false,
					);
					this.loading.set(false);
				},
				error: (error) => {
					console.error('Error loading settings:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to load organization settings',
						life: 3000,
					});
					this.loading.set(false);
				},
			});
	}

	onOrganizationNameChange(): void {
		this.saving.set(true);
		this.organizationService
			.updateOrganization(this.organizationId, {
				name: this.organizationName(),
			})
			.subscribe({
				next: () => {
					this.originalOrganizationName.set(this.organizationName());
					this.messageService.add({
						severity: 'success',
						summary: 'Success',
						detail: 'Organization name updated successfully',
						life: 3000,
					});
					this.saving.set(false);
				},
				error: (error) => {
					console.error('Error updating organization name:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to update organization name',
						life: 3000,
					});
					this.saving.set(false);
				},
			});
	}

	onRedirectToSpaceChange(): void {
		this.saving.set(true);
		this.organizationService
			.updateOrganization(this.organizationId, {
				redirectToSpace: this.redirectToSpace(),
			})
			.subscribe({
				next: () => {
					this.messageService.add({
						severity: 'success',
						summary: 'Success',
						detail: 'Settings updated successfully',
						life: 3000,
					});
					this.saving.set(false);
				},
				error: (error) => {
					console.error('Error updating settings:', error);
					this.messageService.add({
						severity: 'error',
						summary: 'Error',
						detail: 'Failed to update settings',
						life: 3000,
					});
					this.saving.set(false);
				},
			});
	}

	// Helper methods for template two-way binding with signals
	setOrganizationName(value: string): void {
		this.organizationName.set(value);
	}

	setRedirectToSpace(value: boolean): void {
		this.redirectToSpace.set(value);
	}
}
