import { IsOptional, IsString, IsBoolean } from 'class-validator';

export class SpaceUpdateDto {
	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsBoolean()
	isPublic?: boolean;
}
