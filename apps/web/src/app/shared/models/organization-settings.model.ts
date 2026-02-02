// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EntitySettings {
	// Example settings definition.
	// Should be customized based on system entities.
}

/**
 * ThemeMap model
 * Describes the main color palette of the css variables on the web client.
 * These are optional and will overwrite the base styles if included.
 */
export interface ThemeMap {
	primary?: string;
	secondary?: string;
	informative?: string;
	danger?: string;
	warning?: string;
	success?: string;
}

export interface OrganizationSettings {
	// theme?: ThemeMap;
	entities?: EntitySettings;
}
