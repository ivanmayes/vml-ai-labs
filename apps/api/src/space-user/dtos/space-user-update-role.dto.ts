import { IsNotEmpty, IsEnum } from 'class-validator';

import { SpaceRole } from '../space-role.enum';

export class SpaceUserUpdateRoleDto {
	@IsNotEmpty()
	@IsEnum(SpaceRole)
	role!: SpaceRole;
}
