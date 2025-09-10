import {
	Controller,
	Get,
	Body,
	Param,
	Req,
	HttpException,
	HttpStatus,
	UseGuards,
	Put
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { RolesGuard } from '../user/auth/roles.guard';
import { Roles } from '../user/auth/roles.decorator';
import { ObjectUtils } from '../_core/utils';

import { OrganizationService } from './organization.service';
import { Organization } from './organization.entity';

import { UpdateOrgSettingsDto } from './dtos/update-org-settings.dto';
import { HasOrganizationAccessGuard } from './guards/has-organization-access.guard';
import { Utils } from './organization.utils';

//import { Campaign } from '../campaign/campaign.entity';
import { UserRoleMap } from '../user/user.entity';
import { UserRole } from '../user/user-role.enum';

@Controller('organization')
export class OrganizationController {
	constructor(
		private readonly organizationService: OrganizationService
	) {}

	@Get(':orgId/public')
	public async getOrganizationPublic(@Param('orgId') id: string) {
		console.log(id);
		const organization: Organization = await this.organizationService
			.getOrganizationRaw(id)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!organization) {
			throw new HttpException(`Organization not found.`, HttpStatus.NOT_FOUND);
		}

		delete organization.created;
		delete organization.enabled;

		return organization.toPublic(null, ['created']);
	}

	@Get(':orgId')
	@UseGuards(AuthGuard(), HasOrganizationAccessGuard)
	public async getOrganization(@Param('orgId') id: string, @Req() req) {
		const organization: Organization = await this.organizationService
			.getOrganizationRaw(id)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!organization) {
			throw new HttpException(`Organization not found.`, HttpStatus.NOT_FOUND);
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
		@Req() req,
		@Body() updateReq: UpdateOrgSettingsDto
	) {
		const organization: Organization = await this.organizationService
			.getOrganizationRaw(id)
			.catch(err => {
				console.log(err);
				return null;
			});

		const toUpdate = new Organization({
			id: organization.id,
			// Always copy in the current OrgSettings.
			// This is a cheap way to migrate settings to an extended schema.
			settings: ObjectUtils.mergeDeep(
				new UpdateOrgSettingsDto(),
				organization.settings || new UpdateOrgSettingsDto()
			)
		});

		// Since we have initializers on our class properties,
		// the default values carry over into the original updateReq.
		// It has already been validated by the middleware, so we can just pluck
		// the raw values from the request body.
		updateReq = req.body as UpdateOrgSettingsDto;

		if (updateReq) {
			toUpdate.settings = ObjectUtils.mergeDeep(toUpdate.settings, updateReq);
		}

		const result = await this.organizationService.updateOne(toUpdate).catch(err => {
			console.log(err);
			return null;
		});

		if (!result) {
			throw new HttpException('Error saving settings.', HttpStatus.INTERNAL_SERVER_ERROR);
		}

		return {
			settings: result.settings
		};
	}

	@Get(':orgId/settings')
	@UseGuards(AuthGuard(), HasOrganizationAccessGuard)
	public async getOrganizationSettings(@Param('orgId') id: string, @Req() req) {
		const { campaigns, tactics, campaignPackages, ...organization } =
			await this.organizationService.getOrganizationRaw(id).catch(err => {
				console.log(err);
				return null;
			});

		if(!organization) {
			throw new HttpException(`Organization not found.`, HttpStatus.NOT_FOUND);
		}

		const publicOrg = new Organization(organization).toPublic([
			'authenticationStrategies'
		]);

		return {
			...publicOrg,
			//campaigns: campaigns?.map(c => new Campaign(c).toPublic()),
		};
	}
}
