import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ProjectFindDto {
	@IsOptional()
	@IsUUID('4')
	id?: string;

	@IsOptional()
	@IsUUID('4')
	organizationId?: string;

	@IsOptional()
	@IsUUID('4')
	spaceId?: string;
}

export class ProjectCreateDto {
	@IsNotEmpty()
	@IsString()
	name!: string;

	@IsOptional()
	@IsString()
	description?: string;

	@IsNotEmpty()
	@IsUUID('4')
	spaceId!: string;
}

export class ProjectUpdateDto {
	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsString()
	description?: string;
}
