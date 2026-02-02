import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';

export class SpaceCreateDto {
	@IsNotEmpty()
	@IsString()
	name!: string;

	@IsOptional()
	@IsBoolean()
	isPublic?: boolean = true;
}
