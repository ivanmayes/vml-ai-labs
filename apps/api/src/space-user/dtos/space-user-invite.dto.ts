import { IsNotEmpty, IsString, IsEnum, IsEmail } from 'class-validator';
import { SpaceRole } from '../space-role.enum';

export class SpaceUserInviteDto {
	@IsNotEmpty()
	@IsEmail()
	email: string;

	@IsNotEmpty()
	@IsEnum(SpaceRole)
	role: SpaceRole;
}
