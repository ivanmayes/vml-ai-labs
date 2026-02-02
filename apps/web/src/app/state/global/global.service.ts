import {
	HttpClient,
	HttpErrorResponse,
	HttpHeaders,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';
import { tap } from 'rxjs/operators';
import { Title } from '@angular/platform-browser';

import { environment } from '../../../environments/environment';
import type { OrganizationSettings } from '../../../../../api/src/organization/organization.settings';

import { GlobalSettings, HeaderSettings } from './global.model';
import { GlobalStore } from './global.store';

/**
 * Global Service
 * This service is responsible for global level functions and API calls.
 */
@Injectable({ providedIn: 'root' })
export class GlobalService {
	public basePath = environment.apiUrl;
	public defaultHeaders = new HttpHeaders({
		Accept: 'application/json',
	});

	constructor(
		private globalStore: GlobalStore,
		private httpClient: HttpClient,
		private titleService: Title,
		private messageService: MessageService,
	) {}

	/**
	 * Get the organization settings for the site.
	 */
	get() {
		this.globalStore.setLoading(true);

		return this.httpClient
			.get<GlobalSettings>(
				`${environment.apiUrl}/organization/${environment.organizationId}/settings`,
				{
					headers: this.defaultHeaders,
				},
			)
			.pipe(
				tap((settings) => {
					this.globalStore.update({
						settings: {
							...settings,
						},
					});
					this.globalStore.setLoading(false);
				}),
			);
	}

	/**
	 * Get the public version of the organization settings.
	 * This is used for login an other pre-authorization pages.
	 */
	getPublic() {
		this.globalStore.setLoading(true);

		return this.httpClient
			.get<any>(
				`${environment.apiUrl}/organization/${environment.organizationId}/public`,
				{ headers: this.defaultHeaders },
			)
			.pipe(
				tap((settings) => {
					this.globalStore.update({
						settings,
					});
					this.globalStore.setLoading(false);
				}),
			);
	}

	updateOrganizationSettings(settings: Partial<OrganizationSettings>) {
		this.globalStore.setLoading(true);

		return this.httpClient
			.put<any>(
				`${environment.apiUrl}/organization/${environment.organizationId}/settings`,
				settings,
				{
					headers: this.defaultHeaders,
				},
			)
			.pipe(
				tap((updatedSettings) => {
					this.globalStore.update({
						settings: {
							...this.globalStore.getValue().settings,
							settings: updatedSettings,
						} as GlobalSettings,
					});
					this.globalStore.setLoading(false);
				}),
			);
	}

	/**
	 * Set an Admin Mode that triggers some debug UI on the site.
	 * Search adminMode to find all of the places this applies.
	 */
	setAdminMode(state?: boolean) {
		this.globalStore.update({
			adminMode: state || !this.globalStore.getValue().adminMode,
		});
	}

	/**
	 * Hide the top header bar.
	 */
	hideHeader() {
		this.globalStore.update({
			header: {
				...this.globalStore.getValue().header,
				visible: false,
			},
		});
	}

	/**
	 * Show the top header bar.
	 */
	showHeader() {
		this.globalStore.update({
			header: {
				...this.globalStore.getValue().header,
				visible: true,
			},
		});
	}

	setHeaderSettings(headerSettings: Partial<HeaderSettings>) {
		this.globalStore.update({
			header: {
				...this.globalStore.getValue().header,
				...headerSettings,
			},
		});
	}

	getOrganizationSettingsFormObject(
		_settings: OrganizationSettings,
		_controlOverrides: Record<string, unknown> = {},
	): Record<string, unknown> {
		return {
			// Map settings here
		};
	}

	/**
	 * Get the color fo a certain entity in a settings array.
	 */
	getColorFromSettingsEntity(key: string, id: string): string | undefined {
		switch (key) {
			default: {
				const settings = this.globalStore.getValue().settings;
				if (!settings) return undefined;
				const entities = (
					settings as unknown as Record<
						string,
						{ id: string; color?: string }[]
					>
				)[key];
				if (entities) {
					return entities.find(
						(entity: { id: string; color?: string }) =>
							entity.id === id,
					)?.color;
				}
				break;
			}
		}
		return undefined;
	}

	/**
	 * Set the Browser title bar message.
	 */
	setTitle(title: string) {
		this.titleService.setTitle(
			title + ' | ' + this.globalStore.getValue()?.settings?.name,
		);
	}

	/**
	 * Show a toast presenting the saving message to the user.
	 * @param message Override with a custom message
	 */
	triggerSaveMessage(message?: string) {
		this.messageService.add({
			severity: 'success',
			summary: 'Success',
			detail: message || 'Save Successful.',
			life: 2000,
		});
	}

	/**
	 * Show a toast presenting the save success message to the user.
	 * @param message Override with a custom message
	 */
	triggerSaveSuccessMessage(message?: string) {
		this.messageService.add({
			severity: 'success',
			summary: 'Success',
			detail: message || 'Save Successful.',
			life: 2000,
		});
	}

	/**
	 * Show a toast presenting the error message to the user.
	 * @param err The error response object
	 * @param message Override with a custom message
	 */
	triggerErrorMessage(err: HttpErrorResponse | undefined, message?: string) {
		this.messageService.add({
			severity: 'error',
			summary: 'Error',
			detail:
				err?.error?.message ||
				err?.message ||
				message ||
				'There was an error completing this task.',
			life: 4000,
		});
	}
}
