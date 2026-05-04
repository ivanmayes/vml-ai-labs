import {
	ArrayMinSize,
	IsArray,
	IsBoolean,
	IsEnum,
	IsIn,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';

import { UpdaterTaskStatus } from '../entities/updater-task.entity';

export class UpdateTaskDto {
	@IsOptional()
	@IsString()
	@MaxLength(255)
	name?: string;

	@IsOptional()
	@IsEnum(UpdaterTaskStatus)
	status?: UpdaterTaskStatus;

	@IsOptional()
	@IsArray()
	@ArrayMinSize(1)
	@IsIn(['docx', 'pdf', 'pptx', 'xlsx'], { each: true })
	fileExtensions?: string[];

	@IsOptional()
	@IsBoolean()
	includeSubfolders?: boolean;

	@IsOptional()
	@IsIn(['manual'])
	cadence?: string;

	// Re-pointing the task to a different WPP Open project / agent is allowed
	// — the original create-time fields are not strictly immutable. boxFolderId
	// stays immutable: it is the task's true identity.

	@IsOptional()
	@IsString()
	wppOpenProjectId?: string;

	@IsOptional()
	@IsString()
	wppOpenAgentId?: string;

	@IsOptional()
	@IsString()
	@MaxLength(255)
	wppOpenAgentName?: string;

	// Same shape as on CreateTaskDto — when re-pointing project/agent we
	// re-resolve the CS-internal owning project from the user's current
	// osContext and update `wppOpenAgentProjectId`.
	@IsOptional()
	@IsString()
	wppOpenToken?: string;

	@IsOptional()
	osContext?: unknown;
}
