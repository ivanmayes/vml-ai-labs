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
}
