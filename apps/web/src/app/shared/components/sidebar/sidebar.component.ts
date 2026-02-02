import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

import { SessionQuery } from '../../../state/session/session.query';
import { SessionService } from '../../../state/session/session.service';
import { GlobalQuery } from '../../../state/global/global.query';
import { ThemeService } from '../../services/theme.service';
import { SidebarService, NavItem } from '../../services/sidebar.service';
import type { PublicUser } from '../../../../../../api/src/user/user.entity';
import { PrimeNgModule } from '../../primeng.module';

/**
 * Sidebar Component
 *
 * UX Design Notes:
 * - Compact 64px width sidebar with icon-only navigation
 * - Fixed positioning ensures it doesn't scroll with content
 * - Tooltips appear on hover for clarity without permanent labels
 * - User menu uses OverlayPanel for cleaner, more modern interaction
 * - All interactive elements have proper ARIA labels for accessibility
 * - Active route highlighting provides clear navigation feedback
 */
@Component({
	selector: 'app-sidebar',
	templateUrl: './sidebar.component.html',
	styleUrls: ['./sidebar.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [CommonModule, RouterModule, PrimeNgModule],
})
export class SidebarComponent {
	// Signal selectors
	user = this.sessionQuery.user;
	settings = this.globalQuery.settings;
	isAdmin = this.sessionQuery.isAdmin;

	// Existing signal from SidebarService
	navItems = this.sidebarService.navigationItems;

	constructor(
		public sidebarService: SidebarService,
		public themeService: ThemeService,
		private sessionQuery: SessionQuery,
		private sessionService: SessionService,
		private globalQuery: GlobalQuery,
		private router: Router,
	) {}

	/**
	 * Navigate to the organization admin page
	 */
	navigateToAdmin(): void {
		this.router.navigate(['/organization/admin']);
	}

	/**
	 * Handle navigation item clicks
	 * Navigates to the specified route if available
	 */
	handleItemClick(item: NavItem): void {
		if (item.route) {
			this.router.navigate([item.route]);
		}
	}

	/**
	 * Logout user and redirect to login page
	 */
	logout(): void {
		this.sessionService.logout();
		this.router.navigate(['/login']);
	}

	/**
	 * Get user's initial from email for avatar display
	 * Falls back to 'U' if email is not available
	 */
	getUserInitial(user: PublicUser | undefined): string {
		if (user?.email) {
			return user.email.charAt(0).toUpperCase();
		}
		return 'U';
	}

	/**
	 * Check if a route is currently active
	 * Used for highlighting the active navigation item
	 */
	isActiveRoute(route: string): boolean {
		return (
			this.router.url === route || this.router.url.startsWith(route + '/')
		);
	}
}
