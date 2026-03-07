import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';

export class ToggleAppDto {
	@IsNotEmpty()
	@IsString()
	appKey!: string;

	@IsNotEmpty()
	@IsBoolean()
	enabled!: boolean;
}

export class FindOrganizationAppDto {
	@IsOptional()
	@IsString()
	query?: string;

	@IsOptional()
	@IsString()
	sortBy?: string;

	@IsOptional()
	@IsString()
	order?: string;

	@IsOptional()
	@IsString()
	page?: string;

	@IsOptional()
	@IsString()
	limit?: string;
}
