import {
	Controller,
	Get,
	Body,
	Param,
	Req,
	HttpException,
	HttpStatus,
	UseGuards,
	Put,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

import { RolesGuard } from '../user/auth/roles.guard';
import { Roles } from '../user/auth/roles.decorator';
import { ObjectUtils } from '../_core/utils';
import { UserRole } from '../user/user-role.enum';

import { OrganizationService } from './organization.service';
import { Organization } from './organization.entity';
import { UpdateOrgSettingsDto } from './dtos/update-org-settings.dto';
import { HasOrganizationAccessGuard } from './guards/has-organization-access.guard';

@Controller('organization')
export class OrganizationController {
	constructor(private readonly organizationService: OrganizationService) {}

	@Get(':orgId/public')
	public async getOrganizationPublic(@Param('orgId') id: string) {
		const organization: Organization | null = await this.organizationService
			.getOrganizationRaw(id)
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

		// Remove sensitive fields before returning
		const orgCopy = { ...organization } as Partial<Organization>;
		delete orgCopy.created;
		delete orgCopy.enabled;

		return organization.toPublic([], ['created']);
	}

	@Get(':orgId')
	@UseGuards(AuthGuard(), HasOrganizationAccessGuard)
	public async getOrganization(
		@Param('orgId') id: string,
		@Req() _req: Request,
	) {
		const organization: Organization | null = await this.organizationService
			.getOrganizationRaw(id)
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

		// filter on valid retailers based on retailerPermissions
		// if(organization.retailers) {
		// 	const filteredRetailers: Partial<Retailer>[] = [];
		// 	req.user.retailerPermissions
		// 		.map(p1 => p1.retailerId)
		// 		.forEach(element => {
		// 			filteredRetailers.push(organization.retailers.find(r => r.id == element));
		// 		});
		// 	organization.retailers = filteredRetailers;
		// }

		return organization.toPublic();
	}

	@Put(':orgId/settings')
	@Roles(UserRole.SuperAdmin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async updateOrganizationSettings(
		@Param('orgId') id: string,
		@Req() req: Request,
		@Body() _updateReq: UpdateOrgSettingsDto,
	) {
		const organization: Organization | null = await this.organizationService
			.getOrganizationRaw(id)
			.catch(() => {
				return null;
			});

		if (!organization) {
			throw new HttpException(
				`Organization not found.`,
				HttpStatus.NOT_FOUND,
			);
		}

		const toUpdate = new Organization({
			id: organization.id,
			// Always copy in the current OrgSettings.
			// This is a cheap way to migrate settings to an extended schema.
			settings: ObjectUtils.mergeDeep(
				new UpdateOrgSettingsDto() as Record<string, unknown>,
				(organization.settings || new UpdateOrgSettingsDto()) as Record<
					string,
					unknown
				>,
			) as UpdateOrgSettingsDto,
		});

		// Since we have initializers on our class properties,
		// the default values carry over into the original updateReq.
		// It has already been validated by the middleware, so we can just pluck
		// the raw values from the request body.
		const rawSettings = req.body as UpdateOrgSettingsDto;

		if (rawSettings) {
			toUpdate.settings = ObjectUtils.mergeDeep(
				(toUpdate.settings || {}) as Record<string, unknown>,
				rawSettings as Record<string, unknown>,
			) as UpdateOrgSettingsDto;
		}

		const result = await this.organizationService
			.updateOne(toUpdate)
			.catch(() => {
				return null;
			});

		if (!result) {
			throw new HttpException(
				'Error saving settings.',
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		return {
			settings: result.settings,
		};
	}

	@Get(':orgId/settings')
	@UseGuards(AuthGuard(), HasOrganizationAccessGuard)
	public async getOrganizationSettings(
		@Param('orgId') id: string,
		@Req() _req: Request,
	) {
		const organizationRaw = await this.organizationService
			.getOrganizationRaw(id)
			.catch((err) => {
				console.log(err);
				return null;
			});

		if (!organizationRaw) {
			throw new HttpException(
				`Organization not found.`,
				HttpStatus.NOT_FOUND,
			);
		}

		const publicOrg = new Organization(organizationRaw).toPublic([
			'authenticationStrategies',
		]);

		console.log(organizationRaw);

		return {
			data: {
				...publicOrg,
			},
		};
	}

	@Put(':orgId')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async updateOrganization(
		@Param('orgId') id: string,
		@Body() updateData: Partial<Organization>,
	) {
		const organization: Organization | null = await this.organizationService
			.getOrganizationRaw(id)
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

		// Only allow updating specific fields
		const toUpdate = new Organization({
			id: organization.id,
		});

		if (updateData.name !== undefined) {
			toUpdate.name = updateData.name;
		}

		if (updateData.redirectToSpace !== undefined) {
			toUpdate.redirectToSpace = updateData.redirectToSpace;
		}

		const result = await this.organizationService
			.updateOne(toUpdate)
			.catch((err) => {
				console.log(err);
				return null;
			});

		if (!result) {
			throw new HttpException(
				'Error updating organization.',
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		return {
			data: result.toPublic(),
		};
	}
}
