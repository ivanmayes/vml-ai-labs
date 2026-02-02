import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { UserRole } from '../user-role.enum';

import { PermissionRequirement } from './permission-requirements.decorator';
import { PermissionType } from './models/permission.enum';

@Injectable()
export class PermissionsGuard implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext) {
		// Grab permission types from the current route, if they are set
		const types = this.reflector
			.get<
				PermissionRequirement[]
			>('permissionRequirements', context.getHandler())
			?.map((t) => t.type);
		if (!types) {
			return true;
		}
		const request = context.switchToHttp().getRequest();
		const user = request.user;
		const path = request.route.path.toString();

		if (user.role === UserRole.SuperAdmin) {
			return true;
		}

		if (!user.permissions?.length) {
			return false;
		}

		// TODO: Verify...or remove this message
		let campaignId: string | undefined;
		if (path.includes('campaign/:id')) {
			campaignId = request.params.id;
		}
		if (path.includes(':campaignId')) {
			campaignId = request.params.campaignId;
		}

		const relatedPermissions = user.permissions
			.filter((p: { type: PermissionType; campaignId?: string }) => {
				// TOOD: Verify all cases
				if (!types.includes(p.type)) {
					return false;
				}

				if (p.campaignId) {
					if (campaignId) {
						if (p.campaignId !== campaignId) {
							return false;
						}
					}
				}

				return true;
			})
			.map((p: { type: PermissionType; campaignId?: string }) => p.type);

		if (!relatedPermissions?.length) {
			return false;
		}

		for (const t of types) {
			if (!relatedPermissions.includes(t)) {
				return false;
			}
		}

		return true;
	}
}
