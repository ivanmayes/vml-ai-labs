import { IsOptional, IsString } from 'class-validator';

export class SpaceUpdateDto {
	@IsOptional()
	@IsString()
	name?: string;
}
