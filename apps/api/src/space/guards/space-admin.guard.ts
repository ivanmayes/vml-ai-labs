import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

import { UserRole } from '../../user/user-role.enum';
import { SpaceUserService } from '../../space-user/space-user.service';

@Injectable()
export class SpaceAdminGuard implements CanActivate {
	constructor(private readonly spaceUserService: SpaceUserService) {}

	public async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest();

		// Platform admins and super admins have automatic access
		if (
			request?.user?.role === UserRole.SuperAdmin ||
			request?.user?.role === UserRole.Admin
		) {
			return true;
		}

		// Check if user is a space admin
		const spaceId = request?.params?.spaceId;
		const userId = request?.user?.id;

		if (!spaceId || !userId) {
			return false;
		}

		const isSpaceAdmin = await this.spaceUserService.isUserSpaceAdmin(
			spaceId,
			userId,
			request.user.role,
		);

		return isSpaceAdmin;
	}
}
