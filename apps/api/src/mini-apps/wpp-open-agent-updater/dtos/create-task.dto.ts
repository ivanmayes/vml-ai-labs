import {
	ArrayMinSize,
	IsArray,
	IsBoolean,
	IsIn,
	IsNotEmpty,
	IsOptional,
	IsString,
	Matches,
	MaxLength,
} from 'class-validator';

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
	@Matches(/^[a-zA-Z0-9-]+$/)
	wppOpenProjectId: string;

	@IsOptional()
	@IsString()
	@MaxLength(255)
	wppOpenAgentName?: string;

	@IsOptional()
	@IsArray()
	@ArrayMinSize(1)
	@IsIn(['docx', 'pdf', 'pptx', 'xlsx'], { each: true })
	fileExtensions: string[] = ['docx', 'pdf', 'pptx', 'xlsx'];

	@IsOptional()
	@IsBoolean()
	includeSubfolders: boolean = true;

	@IsOptional()
	@IsIn(['manual'])
	cadence: string = 'manual';

	@IsOptional()
	@IsString()
	wppOpenToken?: string;
}
