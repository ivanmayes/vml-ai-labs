import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

import { UserRole } from '../../user/user-role.enum';

@Injectable()
export class HasOrganizationAccessGuard implements CanActivate {
	public async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest();

		if (request?.user?.role === UserRole.SuperAdmin) {
			return true;
		}

		if (request?.params?.orgId === request.user.organizationId) {
			return true;
		}

		if (
			request?.apiKeyScopes?.organizationIds?.includes(
				request?.params?.orgId,
			)
		) {
			return true;
		}

		return false;
	}
}
