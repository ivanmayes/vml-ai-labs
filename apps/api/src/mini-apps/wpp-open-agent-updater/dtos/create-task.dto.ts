import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTaskDto {
	@IsNotEmpty()
	@IsString()
	@MaxLength(255)
	name: string;

	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	boxFolderId: string;

	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	wppOpenAgentId: string;

	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	wppOpenProjectId: string;

	/** Optional: WPP Open token to resolve agent name during creation */
	@IsOptional()
	@IsString()
	wppOpenToken?: string;
}
