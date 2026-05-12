import {
	ChangeDetectionStrategy,
	Component,
	HostListener,
	OnInit,
	signal,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { DialogService } from 'primeng/dynamicdialog';
import { HttpErrorResponse } from '@angular/common/http';
import { take } from 'rxjs/operators';
import { OsContext } from '@wppopen/core';

import { environment } from '../environments/environment';
import { Hierarchy } from '../../../api/src/_core/third-party/wpp-open/models';

import { GlobalService } from './state/global/global.service';
import { SessionQuery } from './state/session/session.query';
import { SessionService } from './state/session/session.service';
import { GlobalQuery } from './state/global/global.query';
import { fade } from './_core/utils/animations.utils';
import { SelectDialogComponent } from './shared/components/select-dialog/select-dialog.component';
import { ORG_SETTINGS } from './state/session/session.store';
import { WppOpenService } from './_core/services/wpp-open/wpp-open.service';
import { HeaderComponent } from './shared/components/header/header.component';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { PrimeNgModule } from './shared/primeng.module';

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

/**
 * Whether the iframe's initial path looks like an explicit deep link the
 * user wants to land on (vs. a generic root / home / login URL where the
 * API's post-auth redirect should take precedence).
 */
function isMeaningfulDeepLink(path: string): boolean {
	if (!path) return false;
	// `Location.path()` returns just the path + query, no origin. Normalize
	// to compare ignoring trailing slash and query.
	const justPath = path.split('?')[0].replace(/\/+$/, '');
	if (!justPath || justPath === '/') return false;
	const lower = justPath.toLowerCase();
	if (lower === '/home' || lower === '/login') return false;
	if (lower.startsWith('/login/') || lower.startsWith('/sso/')) return false;
	return true;
}

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss'],
	animations: [fade('fade', 500)],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CommonModule,
		RouterModule,
		HeaderComponent,
		SidebarComponent,
		PrimeNgModule,
	],
})
export class AppComponent implements OnInit {
	// Signals for zoneless
	loaded = signal(false);

	// Signal selectors from queries
	headerSettings = this.globalQuery.header;
	isLoggedIn = this.sessionQuery.isLoggedInSignal;

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
	) {}

	async ngOnInit() {
		// WPP Open support.

		// Likely in an iframe.
		// Attempt to login with WPP Open token.
		if (window.self !== window.top) {
			// Capture the in-iframe path BEFORE auth. WPP Open loads our app
			// at whatever URL the user opened (a deep link from a shared
			// link, a bookmark, or in-app navigation), and we want to honor
			// that intent over the API's generic post-auth redirect.
			const initialPath = this.location.path();

			const token = await this.wppOpenService
				.getAccessToken()
				.catch(() => {
					return null;
				});

			if (!token) {
				// No WPP Open token.
				return;
			}

			const workspaceScope = await this.wppOpenService
				.getWorkspaceScope()
				.catch(() => {
					return null;
				});

			const context = (await this.wppOpenService
				.getOsContext()
				.catch(() => {
					return null;
				})) as (OsContext & { hierarchy?: Hierarchy }) | null;

			const tenantId = context?.tenant?.id;

			this.sessionService
				.wppOpenLogin(
					token,
					environment.organizationId,
					workspaceScope?.workspaceId,
					workspaceScope?.scopeId,
					context?.project?.id,
					context?.project?.name,
					context?.hierarchy,
					workspaceScope?.tenantId ?? tenantId,
				)
				.pipe(take(1))
				.subscribe(async (resp: WppOpenLoginResponse) => {
					// Load settings directly — no need for getUserStatus()
					// since wppOpenLogin already authenticated us
					await this.loadOrgSettings().catch(() => {
						localStorage.removeItem(ORG_SETTINGS);
					});
					await this.loadGlobalSettings();

					// Deep-link preservation: if the user opened our app at
					// a non-root URL (e.g., `/apps/image-library/<spaceId>`),
					// honor that instead of the API's generic redirect.
					// Treat `/`, `/home`, and `/login` paths as "no deep
					// link" so first-time visits still flow through the
					// API's intended landing.
					if (isMeaningfulDeepLink(initialPath)) {
						await this.router.navigateByUrl(initialPath, {
							replaceUrl: true,
						});
					} else if (resp.redirect) {
						await this.router.navigateByUrl(resp.redirect, {
							replaceUrl: true,
						});
					} else if (resp.spaceId) {
						await this.router.navigate(['/space', resp.spaceId], {
							replaceUrl: true,
						});
					} else {
						await this.router.navigate(['/'], { replaceUrl: true });
					}

					this.loaded.set(true);
				});
		} else {
			this.initializeApp().catch(() => undefined);
		}
	}

	private async initializeApp(spaceId?: string) {
		const settings = await this.loadOrgSettings().catch(() => {
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
				.subscribe({
					next: async () => {
						// Check if we should redirect to a space
						const wppOpenSpaceId = spaceId;
						const currentPath = this.location.path();

						await this.loadGlobalSettings();

						// Only redirect if on root URL (empty or just '/')
						if (
							wppOpenSpaceId &&
							(!currentPath ||
								currentPath === '/' ||
								currentPath === '/home' ||
								currentPath === '')
						) {
							await this.router.navigate(
								['/space', wppOpenSpaceId],
								{
									replaceUrl: true,
								},
							);

							this.loaded.set(true);
							return;
						}

						this.loaded.set(true);
					},
					error: () => {
						// Save the location path so we can go back to it
						this.sessionService.setInitialUrl(this.location.path());

						// Invalid Access Token
						this.router.navigate(['login'], {
							replaceUrl: true,
							skipLocationChange: true,
						});
						this.loaded.set(true);
					},
				});
		} else {
			this.loaded.set(true);
		}
	}

	async loadGlobalSettings() {
		return await this.globalService.get().subscribe({
			error: (err: HttpErrorResponse) =>
				this.globalService.triggerErrorMessage(err),
		});
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
