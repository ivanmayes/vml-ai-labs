import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DialogService } from 'primeng/dynamicdialog';
import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';

import { HeaderSettings } from './state/global/global.model';
import { GlobalService } from './state/global/global.service';
import { SessionQuery } from './state/session/session.query';
import { SessionService } from './state/session/session.service';
import { GlobalQuery } from './state/global/global.query';
import { fade } from './_core/utils/animations.utils';

import { environment } from '../environments/environment';

import { SelectDialogComponent } from './shared/components/select-dialog/select-dialog.component';
import { ORG_SETTINGS } from './state/session/session.store';
import { WppOpenService } from './_core/services/wpp-open/wpp-open.service';
import { OsContext } from '@wppopen/core';
import { Hierarchy } from '../../../api/src/_core/third-party/wpp-open/models';

interface ApiSetting {
	name: string;
	endpoint: string;
	organizationId: string;
	production?: boolean;
	locale?: string;
}

interface WppOpenLoginResponse {
	redirect?: string;
	spaceId?: string;
}

@Component({
	standalone: false,
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss'],
	animations: [fade('fade', 500)],
})
export class AppComponent implements OnInit {
	public loaded = false;
	public headerSettings$: Observable<HeaderSettings>;
	public isLoggedIn$: Observable<boolean>;

	// Detect keypresses for setting admin mode
	@HostListener('document:keydown', ['$event'])
	onKeyPress(event: KeyboardEvent) {
		if (event.key === ';' && event.ctrlKey) {
			this.globalService.setAdminMode();
		}
	}

	constructor(
		private readonly globalQuery: GlobalQuery,
		private readonly globalService: GlobalService,
		private readonly sessionService: SessionService,
		private readonly sessionQuery: SessionQuery,
		private readonly router: Router,
		private readonly location: Location,
		private readonly dialogService: DialogService,
		private readonly wppOpenService: WppOpenService,
	) {
		this.headerSettings$ = this.globalQuery.select('header');
		this.isLoggedIn$ = this.sessionQuery.isLoggedIn$;
	}

	async ngOnInit() {
		// WPP Open support.

		// Likely in an iframe.
		// Attempt to login with WPP Open token.
		if (window.self !== window.top) {
			const token = await this.wppOpenService
				.getAccessToken()
				.catch((err) => {
					console.error('Penpal child context error:', err);
					return null;
				});

			if (!token) {
				// No WPP Open token.
				return;
			}

			const workspaceScope = await this.wppOpenService
				.getWorkspaceScope()
				.catch((err) => {
					console.error('Penpal child workspace scope error:', err);
					return null;
				});

			const context = (await this.wppOpenService
				.getOsContext()
				.catch((err) => {
					console.error('Penpal child context error:', err);
					return null;
				})) as (OsContext & { hierarchy?: Hierarchy }) | null;

			// Log tenant ID for easy configuration
			const tenantId = context?.tenant?.id;
			if (tenantId) {
				console.log('🔑 WPP Open Tenant ID:', tenantId);
				console.log(
					'💡 Add this ID to Space Settings → WPP Open Tenant IDs to enable access',
				);
			}

			this.sessionService
				.wppOpenLogin(
					token,
					environment.organizationId,
					workspaceScope?.workspaceId,
					workspaceScope?.scopeId,
					context?.project?.id,
					context?.project?.name,
					context?.hierarchy,
					tenantId,
				)
				.pipe(take(1))
				.subscribe((resp: WppOpenLoginResponse) => {
					if (resp.redirect) {
						this.router.navigate([resp.redirect], {
							replaceUrl: true,
						});
					} else {
						console.log('Open Response', resp);
						this.initializeApp(resp.spaceId).catch((err) => {
							console.log(err);
						});
					}
				});
		} else {
			this.initializeApp().catch((err) => {
				console.log(err);
			});
		}
	}

	private async initializeApp(spaceId?: string) {
		const settings = await this.loadOrgSettings().catch((err) => {
			console.log(err);
			localStorage.removeItem(ORG_SETTINGS);
			return null;
		});

		if (!settings) {
			console.error(
				'Configuration error. Unable to load or parse API_MAP.',
			);
		}

		// Refresh our token before we do anything else
		if (this.location.path().indexOf('login') === -1) {
			this.sessionService
				.getUserStatus(this.sessionQuery.getToken())
				.subscribe(
					async () => {
						// Check if we should redirect to a space
						const wppOpenSpaceId = spaceId;
						const currentPath = this.location.path();

						await this.loadGlobalSettings();

						// Only redirect if on root URL (empty or just '/')
						console.log(
							'Current Path:',
							currentPath,
							'WPP Open Space ID:',
							wppOpenSpaceId,
						);
						if (
							wppOpenSpaceId &&
							(!currentPath ||
								currentPath === '/' ||
								currentPath === '/home' ||
								currentPath === '')
						) {
							console.log(
								'Redirecting to WPP Open Space ID:',
								wppOpenSpaceId,
							);
							await this.router.navigate(
								['/space', wppOpenSpaceId],
								{
									replaceUrl: true,
								},
							);

							this.loaded = true;
							return;
						}

						this.loaded = true;
					},
					() => {
						// Save the location path so we can go back to it
						this.sessionService.setInitialUrl(this.location.path());

						// Invalid Access Token
						this.router.navigate(['login'], {
							replaceUrl: true,
							skipLocationChange: true,
						});
						this.loaded = true;
					},
				);
		} else {
			this.loaded = true;
		}
	}

	async loadGlobalSettings() {
		return await this.globalService.get().subscribe(
			(settings) => {
				console.log('Loaded Global Settings', settings);
			},
			(err: HttpErrorResponse) =>
				this.globalService.triggerErrorMessage(err),
		);
	}

	private async loadOrgSettings() {
		return new Promise((resolve, reject) => {
			if (!environment.exclusive) {
				const savedOrg = localStorage.getItem(ORG_SETTINGS);

				if (savedOrg) {
					try {
						const orgData = JSON.parse(savedOrg);
						environment.apiUrl = orgData.endpoint;
						environment.organizationId = orgData.organizationId;
						environment.production =
							orgData.production || environment.production;
						environment.locale =
							orgData.locale || environment.locale;
						resolve(true);
					} catch (_err) {
						reject(`Couldn't parse org settings.`);
						return;
					}
				} else {
					const dialogRef = this.dialogService.open(
						SelectDialogComponent,
						{
							header: 'Select an Organization',
							data: {
								title: 'Select an Organization',
								options: environment.apiSettings?.reduce(
									(
										acc: Record<string, ApiSetting>,
										cur: ApiSetting,
									) => {
										acc[cur.name] = cur;
										return acc;
									},
									{},
								),
							},
						},
					);

					dialogRef?.onClose.subscribe((result) => {
						if (result) {
							localStorage.setItem(
								ORG_SETTINGS,
								JSON.stringify(result),
							);
							environment.apiUrl = result.endpoint;
							environment.organizationId = result.organizationId;
							environment.production =
								result.production || environment.production;
							environment.locale =
								result.locale || environment.locale;
						}
						resolve(true);
					});
				}
			} else {
				resolve(true);
			}
		});
	}
}
