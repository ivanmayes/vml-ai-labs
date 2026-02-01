import { Type } from 'class-transformer';
import {
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	ValidateNested,
} from 'class-validator';

import { Hierarchy } from '../../_core/third-party/wpp-open/models';

export class WPPOpenLoginRequestDto {
	@IsNotEmpty()
	@IsString()
	token: string;

	@IsUUID('4')
	@IsNotEmpty()
	organizationId: string;

	@IsNotEmpty()
	@IsString()
	workspaceId: string;

	@IsOptional()
	@IsNotEmpty()
	@IsString()
	scopeId?: string;

	@IsOptional()
	@IsNotEmpty()
	@IsString()
	projectRemoteId?: string;

	@IsOptional()
	@IsNotEmpty()
	@IsString()
	projectRemoteName?: string;

	@IsOptional()
	@ValidateNested()
	@Type(() => Hierarchy)
	hierarchy?: Hierarchy;

	@IsOptional()
	@IsString()
	tenantId?: string;
}
