import { Injectable, Inject, signal, effect } from '@angular/core';
import { DOCUMENT } from '@angular/common';

export type Theme = 'light' | 'dark' | 'auto';

@Injectable({
	providedIn: 'root',
})
export class ThemeService {
	private readonly STORAGE_KEY = 'app-theme-preference';
	private readonly theme = signal<Theme>('light');

	// Public readonly signal for components to consume
	public readonly currentTheme = this.theme.asReadonly();

	constructor(@Inject(DOCUMENT) private document: Document) {
		// Load saved theme preference or default to light
		const savedTheme = this.loadThemePreference();
		this.theme.set(savedTheme);

		// Apply theme whenever it changes
		effect(() => {
			this.applyTheme(this.theme());
		});

		// Listen for system theme changes if auto mode is selected
		this.listenToSystemThemeChanges();
	}

	/**
	 * Set the theme
	 */
	setTheme(theme: Theme): void {
		this.theme.set(theme);
		this.saveThemePreference(theme);
	}

	/**
	 * Toggle between light and dark themes
	 */
	toggleTheme(): void {
		const current = this.theme();
		const next = current === 'light' ? 'dark' : 'light';
		this.setTheme(next);
	}

	/**
	 * Get the current theme
	 */
	getTheme(): Theme {
		return this.theme();
	}

	/**
	 * Check if dark mode is active
	 */
	isDarkMode(): boolean {
		const theme = this.theme();
		if (theme === 'auto') {
			return this.getSystemTheme() === 'dark';
		}
		return theme === 'dark';
	}

	/**
	 * Apply theme to the document
	 */
	private applyTheme(theme: Theme): void {
		const root = this.document.documentElement;

		if (theme === 'auto') {
			// Let the system preference take over
			root.removeAttribute('data-theme');
		} else {
			// Set explicit theme
			root.setAttribute('data-theme', theme);
		}

		// Update meta theme-color for mobile browsers
		this.updateMetaThemeColor(theme);
	}

	/**
	 * Update meta theme-color tag for mobile browsers
	 */
	private updateMetaThemeColor(theme: Theme): void {
		let metaThemeColor = this.document.querySelector(
			'meta[name="theme-color"]',
		);

		if (!metaThemeColor) {
			metaThemeColor = this.document.createElement('meta');
			metaThemeColor.setAttribute('name', 'theme-color');
			this.document.head.appendChild(metaThemeColor);
		}

		// Get the actual theme (resolve auto)
		const actualTheme = theme === 'auto' ? this.getSystemTheme() : theme;

		// Set appropriate color based on theme
		const color = actualTheme === 'dark' ? '#121212' : '#fafafa';
		metaThemeColor.setAttribute('content', color);
	}

	/**
	 * Load theme preference from localStorage
	 */
	private loadThemePreference(): Theme {
		try {
			const saved = localStorage.getItem(this.STORAGE_KEY);
			if (saved === 'light' || saved === 'dark' || saved === 'auto') {
				return saved;
			}
		} catch {
			// Could not load theme preference - using default
		}

		// Default to auto (system preference)
		return 'auto';
	}

	/**
	 * Save theme preference to localStorage
	 */
	private saveThemePreference(theme: Theme): void {
		try {
			localStorage.setItem(this.STORAGE_KEY, theme);
		} catch {
			// Could not save theme preference
		}
	}

	/**
	 * Get the system theme preference
	 */
	private getSystemTheme(): 'light' | 'dark' {
		return window.matchMedia('(prefers-color-scheme: dark)').matches
			? 'dark'
			: 'light';
	}

	/**
	 * Listen to system theme changes
	 */
	private listenToSystemThemeChanges(): void {
		if (!window.matchMedia) {
			return;
		}

		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

		// Modern browsers
		if (mediaQuery.addEventListener) {
			mediaQuery.addEventListener('change', () => {
				if (this.theme() === 'auto') {
					// Re-apply theme to update based on new system preference
					this.applyTheme('auto');
					this.updateMetaThemeColor('auto');
				}
			});
		}
	}

	/**
	 * Initialize theme on app startup
	 * Call this from AppComponent's ngOnInit
	 */
	initialize(): void {
		// Theme is automatically applied via the effect in constructor
		// This method is here for explicit initialization if needed
		const theme = this.theme();
		this.applyTheme(theme);
	}

	/**
	 * Get available themes
	 */
	getAvailableThemes(): Theme[] {
		return ['light', 'dark', 'auto'];
	}

	/**
	 * Get theme display name for UI
	 */
	getThemeDisplayName(theme: Theme): string {
		switch (theme) {
			case 'light':
				return 'Light';
			case 'dark':
				return 'Dark';
			case 'auto':
				return 'System';
			default:
				return theme;
		}
	}

	/**
	 * Get theme icon for UI (Material Icons)
	 */
	getThemeIcon(theme: Theme): string {
		switch (theme) {
			case 'light':
				return 'light_mode';
			case 'dark':
				return 'dark_mode';
			case 'auto':
				return 'brightness_auto';
			default:
				return 'brightness_medium';
		}
	}
}
