import { SpaceRole } from './space-role.enum';

export interface SpaceUser {
	id: string;
	spaceId: string;
	userId: string;
	role: SpaceRole;
	user?: {
		id: string;
		email: string;
		firstName?: string;
		lastName?: string;
	};
	createdAt: string;
	updatedAt: string;
}

export interface InviteSpaceUserDto {
	userId: string;
	role: SpaceRole;
}

export interface UpdateSpaceUserRoleDto {
	role: SpaceRole;
}
