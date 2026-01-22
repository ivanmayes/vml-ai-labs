import { Component, OnInit } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { GlobalSettings } from '../../../../state/global/global.model';
import { GlobalQuery } from '../../../../state/global/global.query';
import { Observable } from 'rxjs';
import { SessionQuery } from '../../../../state/session/session.query';
import { SessionService } from '../../../../state/session/session.service';
import { Router } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import type { PublicUser } from '../../../../../../../api/src/user/user.entity';
import { ThemeService } from '../../../services/theme.service';

/**
 * Account Bar Component
 * This component handles the user profile / account button on the header bar.
 */
@Component({
	standalone: false,
    selector: 'app-account-bar',
    templateUrl: './account-bar.component.html',
    styleUrls: ['./account-bar.component.scss'],
    
})
export class AccountBarComponent implements OnInit {
	public settings$: Observable<GlobalSettings>;
	public user$: Observable<PublicUser>;
	public accountMenuItems: MenuItem[];

	public production = environment.production;

	constructor(
		private readonly globalQuery: GlobalQuery,
		private readonly sessionQuery: SessionQuery,
		private readonly sessionService: SessionService,
		private readonly router: Router,
		public readonly themeService: ThemeService
	) {
		this.settings$ = this.globalQuery.select('settings');
		this.user$ = this.sessionQuery.select('user');
	}

	ngOnInit(): void {
		this.accountMenuItems = [
			{
				label: 'Logout',
				icon: 'pi pi-sign-out',
				command: () => this.logout()
			}
		];
	}

	logout() {
		this.sessionService.logout();
		this.router.navigate(['/login']);
	}

	toggleTheme(): void {
		this.themeService.toggleTheme();
	}

	getThemeIcon(): string {
		const currentTheme = this.themeService.getTheme();
		// Show the opposite theme icon (what it will switch to)
		return currentTheme === 'light' ? 'dark_mode' : 'light_mode';
	}

	getThemeTooltip(): string {
		const currentTheme = this.themeService.getTheme();
		// Show what theme it will switch to
		return currentTheme === 'light' ? 'dark mode' : 'light mode';
	}
}
