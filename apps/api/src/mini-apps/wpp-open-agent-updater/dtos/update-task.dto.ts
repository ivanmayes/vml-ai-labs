import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { UpdaterTaskStatus } from '../entities/updater-task.entity';

export class UpdateTaskDto {
	@IsOptional()
	@IsString()
	@MaxLength(255)
	name?: string;

	@IsOptional()
	@IsEnum(UpdaterTaskStatus)
	status?: UpdaterTaskStatus;
}
