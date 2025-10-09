import { IsOptional, IsString, IsBoolean, IsObject, IsArray, Matches } from 'class-validator';

export class SpaceUpdateSettingsDto {
	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsBoolean()
	isPublic?: boolean;

	@IsOptional()
	@IsObject()
	settings?: {
		primaryColor?: string;
	};

	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	approvedWPPOpenTenantIds?: string[];
}

// Hex color validator
export function IsHexColor() {
	return Matches(/^#[0-9A-Fa-f]{6}$/, {
		message: 'primaryColor must be a valid hex color code (e.g., #FF5733)'
	});
}
