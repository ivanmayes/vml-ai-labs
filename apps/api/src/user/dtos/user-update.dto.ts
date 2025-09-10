import { Type } from 'class-transformer';
import {
	IsBoolean,
	IsEmail,
	IsEnum,
	IsNotEmpty,
	IsNotEmptyObject,
	IsObject,
	IsOptional,
	IsString,
	IsUUID,
	ValidateNested
} from 'class-validator';
import { PublicProfile } from '../../user/user.entity';
import { UserRole } from '../user-role.enum';
import { PermissionDto } from '.';

export class UserUpdateDto {
	@IsOptional()
	@ValidateNested()
	@Type(() => PublicProfile)
	profile?: PublicProfile;

	@IsOptional()
	@IsEnum(UserRole)
	role?: UserRole;

	@IsOptional()
	@IsUUID()
	authenticationStrategyId?: string;

	@IsBoolean()
	@IsOptional()
	deactivated?: boolean;

	@IsOptional()
	@ValidateNested({ each: true })
	@Type(() => PermissionDto)
	permissions?: PermissionDto[];
}
