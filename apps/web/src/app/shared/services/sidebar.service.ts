import { Injectable, signal } from '@angular/core';

export interface NavItem {
	id: string;
	icon: string;
	label: string;
	route?: string;
	badge?: number | string;
	badgeColor?: 'primary' | 'accent' | 'warn';
	dividerAfter?: boolean;
}

@Injectable({
	providedIn: 'root',
})
export class SidebarService {
	// Navigation items
	private readonly navItems = signal<NavItem[]>([
		{
			id: 'home',
			icon: 'home',
			label: 'Home',
			route: '/home',
		},
		// Add more navigation items here
	]);

	public readonly navigationItems = this.navItems.asReadonly();

	/**
	 * Update navigation items
	 */
	setNavigationItems(items: NavItem[]): void {
		this.navItems.set(items);
	}

	/**
	 * Add a navigation item
	 */
	addNavigationItem(item: NavItem): void {
		const items = [...this.navItems()];
		items.push(item);
		this.navItems.set(items);
	}

	/**
	 * Remove a navigation item
	 */
	removeNavigationItem(itemId: string): void {
		const items = this.navItems().filter((item) => item.id !== itemId);
		this.navItems.set(items);
	}

	/**
	 * Update badge for a navigation item
	 */
	updateItemBadge(
		itemId: string,
		badge?: number | string,
		badgeColor?: 'primary' | 'accent' | 'warn',
	): void {
		const items = [...this.navItems()];
		const item = items.find((i) => i.id === itemId);

		if (item) {
			item.badge = badge;
			item.badgeColor = badgeColor;
			this.navItems.set(items);
		}
	}
}
