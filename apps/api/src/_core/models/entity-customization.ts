import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class EntityCustomization {
	@IsOptional()
	@IsBoolean()
	disabled?: boolean = null;

	@IsOptional()
	@IsString()
	mask?: string = null;
}
