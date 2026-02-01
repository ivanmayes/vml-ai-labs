import {
	Controller,
	Get,
	UseGuards,
	HttpException,
	HttpStatus,
	Param,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { Roles } from '../user/auth/roles.decorator';
import { RolesGuard } from '../user/auth/roles.guard';
import { HasOrganizationAccessGuard } from '../organization/guards/has-organization-access.guard';
import { OrganizationService } from '../organization/organization.service';
import { Organization } from '../organization/organization.entity';
import { UserRole } from '../user/user-role.enum';

@Controller('organization/:orgId/authentication-strategy')
export class AuthenticationStrategyController {
	constructor(private readonly organizationService: OrganizationService) {}

	@Get()
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getOrganizationAuthenticationStrategy(
		@Param('orgId') orgId: string,
	) {
		const organization: Organization | null = await this.organizationService
			.getOrganizationRaw(orgId)
			.catch((err) => {
				console.log(err);
				return null;
			});

		if (!organization) {
			throw new HttpException(
				`Organization not found.`,
				HttpStatus.NOT_FOUND,
			);
		}

		return {
			authenticationStrategies: organization.authenticationStrategies,
		};
	}
}
