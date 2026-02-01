import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

import { UserRole } from '../../user/user-role.enum';
import { SpaceUserService } from '../../space-user/space-user.service';
import { SpaceService } from '../space.service';

@Injectable()
export class SpaceAccessGuard implements CanActivate {
	constructor(
		private readonly spaceUserService: SpaceUserService,
		private readonly spaceService: SpaceService,
	) {}

	public async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest();

		// Platform admins and super admins have automatic access
		if (
			request?.user?.role === UserRole.SuperAdmin ||
			request?.user?.role === UserRole.Admin
		) {
			return true;
		}

		const spaceId = request?.params?.spaceId || request?.params?.id;
		const userId = request?.user?.id;

		if (!spaceId || !userId) {
			return false;
		}

		// Get the space to check if it's public
		const space = await this.spaceService.findOne({
			where: { id: spaceId },
		});

		if (!space) {
			return false;
		}

		// Check if user has access based on space visibility
		const hasAccess = await this.spaceUserService.hasSpaceAccess(
			spaceId,
			userId,
			request.user.role,
			space.isPublic,
		);

		return hasAccess;
	}
}
