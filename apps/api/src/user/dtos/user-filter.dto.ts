import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { UserRole } from '../user-role.enum';

export class UsersFilterDto {
	@IsString()
	@IsOptional()
	query?: string;

	@IsEnum(UserRole)
	@IsOptional()
	role?: UserRole;
}
