import { IsOptional, IsUUID } from 'class-validator';

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
