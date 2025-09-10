import { IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { ExampleSettings } from '../examples/example.settings';
export class EntitySettings {
	// Example settings definition.
	// Should be customized based on system entities.
	// @IsOptional()
	// @ValidateNested()
	// @Type(() => ExampleSettings)
	// someEntity?: ExampleSettings = new ExampleSettings();
}

/**
 * ThemeMap model
 * Describes the main color palette of the css variables on the web client.
 * These are optional and will overwrite the base styles if included.
 */
export class ThemeMap {
	primary?: string;
	secondary?: string;
	informative?: string;
	danger?: string;
	warning?: string;
	success?: string;
}

export class OrganizationSettings {
	// theme?: ThemeMap = {};

	@IsOptional()
	@ValidateNested()
	@Type(() => EntitySettings)
	entities?: EntitySettings = new EntitySettings();
}
