import { Type } from 'class-transformer';
import {
	IsBoolean,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	ValidateNested
} from 'class-validator';
import { PublicProfile } from '../../user/user.entity';
import { UserRole } from '../user-role.enum';
import { PermissionDto } from '.';

export class UserAddDto {
	@ValidateNested()
	@Type(() => PublicProfile)
	profile: PublicProfile;

	@IsNotEmpty()
	@IsString()
	email: string;

	@IsNotEmpty()
	@IsEnum(UserRole)
	role: UserRole;

	@IsOptional()
	@IsUUID()
	authenticationStrategyId?: string;

	@IsBoolean()
	@IsOptional()
	deactivated: boolean = false;

	@IsOptional()
	@ValidateNested({ each: true })
	@Type(() => PermissionDto)
	permissions?: PermissionDto[];
}
