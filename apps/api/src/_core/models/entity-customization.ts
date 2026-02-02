import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class EntityCustomization {
	@IsOptional()
	@IsBoolean()
	disabled?: boolean | null = null;

	@IsOptional()
	@IsString()
	mask?: string | null = null;
}
