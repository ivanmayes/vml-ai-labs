import { Component, HostListener, Inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Location, DOCUMENT } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

import { HeaderSettings } from './state/global/global.model';
import { GlobalService } from './state/global/global.service';
import { SessionQuery } from './state/session/session.query';
import { SessionService } from './state/session/session.service';
import { GlobalQuery } from './state/global/global.query';
import { fade } from './_core/utils/animations.utils';

import { environment } from '../environments/environment';

import { SelectDialogComponent } from './shared/components/select-dialog/select-dialog.component';
import { ORG_SETTINGS } from './state/session/session.store';
//import { WppOpenService } from './_core/services/wpp-open/wpp-open.service';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss'],
	animations: [fade('fade', 500)]
})
export class AppComponent {
	public loaded = false;
	public headerSettings$: Observable<HeaderSettings>;

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
		private readonly dialog: MatDialog,
		//private readonly wppOpenService: WppOpenService,
		@Inject(DOCUMENT) private readonly document: Document
	) {
		this.headerSettings$ = this.globalQuery.select('header');
		this.initializeApp().catch(err => {
			console.log(err);
		});
	}

	async ngOnInit() {
		// WPP Open support.
		// Install @wppopen/core@^3.0.0
		// Uncomment imports above
		// Uncomment below
		// Uncomment in session.service.ts
		// Uncomment in core.module.ts
		// Remove .disabled from wpp-open.service.ts


		//// Likely in an iframe.
		//// Attempt to login with WPP Open token.
		// if(window.self !== window.top) {
		// 	const token = await this.wppOpenService
		// 		.getAccessToken()
		// 		.catch(err => {
		// 			console.error('Penpal child context error:', err);
		// 			return null;
		// 		});

		// 	if(!token) {
		// 		// No WPP Open token.
		// 		return;
		// 	}

		// 	const workspaceScope = await this.wppOpenService
		// 		.getWorkspaceScope()
		// 		.catch(err => {
		// 			console.error('Penpal child workspace scope error:', err);
		// 			return null;
		// 		});

		// 	const context: FullscreenAppContext & { hierarchy?: Hierarchy } = await this.wppOpenService
		// 		.getOsContext()
		// 		.catch(err => {
		// 			console.error('Penpal child context error:', err);
		// 			return null;
		// 		});

		// 	this.sessionService
		// 		.wppOpenLogin(
		// 			token,
		// 			environment.organizationId,
		// 			workspaceScope?.workspaceId,
		// 			workspaceScope?.scopeId,
		// 			context?.project?.id,
		// 			context?.project?.name,
		// 			context?.hierarchy
		// 		)
		// 		.pipe(take(1))
		// 		.subscribe((resp) => {
		// 			if(resp.redirect) {
		// 				this.router.navigate([resp?.redirect], {
		// 					replaceUrl: true
		// 				});
		// 			}
		// 		});
		// }
	}

	private async initializeApp() {
		const settings = await this.loadOrgSettings().catch(err => {
			console.log(err);
			localStorage.removeItem(ORG_SETTINGS);
			return null;
		});

		if (!settings) {
			console.error('Configuration error. Unable to load or parse API_MAP.');
		}

		// Once logged in, load settings and start up services
		this.sessionQuery.isLoggedIn$.pipe(filter(isLoggedIn => isLoggedIn === true)).subscribe(() => {
			this.loadGlobalSettings();
		});

		// Refresh our token before we do anything else
		if (this.location.path().indexOf('login') === -1) {
			this.sessionService.getUserStatus(this.sessionQuery.getToken()).subscribe(
				() => {
					this.loaded = true;
				},
				() => {
					// Save the location path so we can go back to it
					this.sessionService.setInitialUrl(this.location.path());

					// Invalid Access Token
					this.router.navigate(['login'], {
						replaceUrl: true,
						skipLocationChange: true
					});
					this.loaded = true;
				}
			);
		} else {
			this.loaded = true;
		}
	}

	loadGlobalSettings() {
		this.globalService.get().subscribe(
			settings => {
				console.log('Loaded Global Settings', settings);
			},
			(err: HttpErrorResponse) => this.globalService.triggerErrorMessage(err)
		);
	}

	private async loadOrgSettings() {
		return new Promise((resolve, reject) => {
			if (!environment.exclusive) {
				const savedOrg = localStorage.getItem(ORG_SETTINGS);

				if (savedOrg) {
					try {
						let orgData = JSON.parse(savedOrg);
						environment.apiUrl = orgData.endpoint;
						environment.organizationId = orgData.organizationId;
						environment.production = orgData.production || environment.production;
						environment.locale = orgData.locale || environment.locale;
						resolve(true);
					} catch (err) {
						reject(`Couldn't parse org settings.`);
						return;
					}
				} else {
					const dialogRef = this.dialog.open(SelectDialogComponent, {
						data: {
							title: 'Select an Organization',
							options: environment.apiSettings?.reduce((acc, cur) => {
								acc[cur.name] = cur;
								return acc;
							}, {})
						}
					});

					dialogRef.afterClosed().subscribe(result => {
						localStorage.setItem(ORG_SETTINGS, JSON.stringify(result));
						environment.apiUrl = result.endpoint;
						environment.organizationId = result.organizationId;
						environment.production = result.production || environment.production;
						environment.locale = result.locale || environment.locale;
						resolve(true);
					});
				}
			} else {
				resolve(true);
			}
		});
	}
}
