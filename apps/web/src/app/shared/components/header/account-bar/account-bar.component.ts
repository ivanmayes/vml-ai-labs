import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MenuItem } from 'primeng/api';
import { Router, RouterModule } from '@angular/router';

import { GlobalQuery } from '../../../../state/global/global.query';
import { SessionQuery } from '../../../../state/session/session.query';
import { SessionService } from '../../../../state/session/session.service';
import { environment } from '../../../../../environments/environment';
import { ThemeService } from '../../../services/theme.service';
import { PrimeNgModule } from '../../../primeng.module';

/**
 * Account Bar Component
 * This component handles the user profile / account button on the header bar.
 */
@Component({
	selector: 'app-account-bar',
	templateUrl: './account-bar.component.html',
	styleUrls: ['./account-bar.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, RouterModule, PrimeNgModule],
})
export class AccountBarComponent implements OnInit {
	// Signal selectors
	settings = this.globalQuery.settings;
	user = this.sessionQuery.user;
	isAdmin = this.sessionQuery.isAdmin;

	public accountMenuItems!: MenuItem[];
	public production = environment.production;

	constructor(
		private readonly globalQuery: GlobalQuery,
		private readonly sessionQuery: SessionQuery,
		private readonly sessionService: SessionService,
		private readonly router: Router,
		public readonly themeService: ThemeService,
	) {}

	ngOnInit(): void {
		this.accountMenuItems = [
			{
				label: 'Logout',
				icon: 'pi pi-sign-out',
				command: () => this.logout(),
			},
		];
	}

	logout() {
		this.sessionService.logout();
		this.router.navigate(['/login']);
	}

	navigateToAdmin() {
		this.router.navigate(['/organization/admin']);
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
