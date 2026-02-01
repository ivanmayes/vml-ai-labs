import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';

import { UserRole } from '../user-role.enum';

export class UserPromoteDto {
	@IsNotEmpty()
	@IsUUID()
	userId: string;

	@IsNotEmpty()
	@IsEnum(UserRole)
	targetRole: UserRole;
}
