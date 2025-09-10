import { SetMetadata } from '@nestjs/common';

import { PermissionType } from './models/permission.enum';

export interface PermissionRequirement {
	type: PermissionType;
}

export const PermissionRequirements = (...reqs: PermissionRequirement[]) =>
	SetMetadata('permissionRequirements', reqs);
