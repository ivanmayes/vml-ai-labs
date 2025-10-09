import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { IsRecord } from '../../../decorators/is-record.decorator';

export class WPPOpenTokenResponse {
	id: string;
	firstname: string;
	lastname: string;
	email: string;
	active: boolean;
	agency: string;
	country: string;
	department: string;
	jobTitle: string;
	officeLocation: string;
	displayLanguage: string;
	createdAt: string;
}

export class Workspace {
	id: string;
	name: string;
	type: string; // TODO: Grab Enum
	description: string;
	status: string;
	parentId: string;
	categories?: string[];
	countries: string[];
	logoUrl?: string;
	createdAt: string;
	updatedAt: string;
}

export class HierarchyItem {
	@IsString()
	@IsNotEmpty()
	azId: string;

	@IsOptional()
	@IsString()
	parentAzId?: string;

	@IsString()
	@IsNotEmpty()
	name: string;

	// TODO: Grab Enum
	@IsString()
	@IsNotEmpty()
	type: string;

	@IsOptional()
	@IsString()
	customTypeName?: string;

	@IsOptional()
	@IsString()
	mdId?: string;

	@IsOptional()
	@IsString({ each: true })
	categories?: string[];
}

export class Hierarchy {
	@IsString()
	azId: string;

	@IsRecord(HierarchyItem)
	mapping: { [azId: string]: HierarchyItem };
}

export class WorkspaceHierarchy {
	workspace: Workspace;
	ancestors?: WorkspaceHierarchy[];
}

export class WPPOpenWorkspaceAncestorResponse {
	data: WorkspaceHierarchy[];
}