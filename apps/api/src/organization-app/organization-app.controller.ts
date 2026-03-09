import {
	Controller,
	Get,
	Post,
	Body,
	UseGuards,
	HttpException,
	HttpStatus,
	Req,
	Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { Roles } from '../user/auth/roles.decorator';
import { RolesGuard } from '../user/auth/roles.guard';
import { UserRole } from '../user/user-role.enum';
import { User } from '../user/user.entity';
import { ResponseEnvelope, ResponseStatus } from '../_core/models';

import { OrganizationAppService } from './organization-app.service';
import { OrganizationApp } from './organization-app.entity';
import { ToggleAppDto, FindOrganizationAppDto } from './dtos';

const basePath = 'organization-app';

@Controller(basePath)
export class OrganizationAppController {
	constructor(
		private readonly organizationAppService: OrganizationAppService,
	) {}

	@Get('enabled')
	@UseGuards(AuthGuard())
	public async getEnabledApps(@Req() req: Request & { user: User }) {
		const orgId = req.user.organizationId;

		if (!orgId) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Organization not found for user.',
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		const apps = await this.organizationAppService
			.getEnabledApps(orgId)
			.catch((_err) => {
				return null;
			});

		if (!apps) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Error loading enabled apps.',
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			apps.map((app) => new OrganizationApp(app).toPublic()),
		);
	}

	@Post('toggle')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard)
	public async toggleApp(
		@Req() req: Request & { user: User },
		@Body() toggleDto: ToggleAppDto,
	) {
		const orgId = req.user.organizationId;

		if (!orgId) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Organization not found for user.',
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		const result = toggleDto.enabled
			? await this.organizationAppService
					.enableApp(orgId, toggleDto.appKey)
					.catch((_err) => {
						return null;
					})
			: await this.organizationAppService
					.disableApp(orgId, toggleDto.appKey)
					.catch((_err) => {
						return null;
					});

		if (!result) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Error toggling app.',
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			`App ${toggleDto.enabled ? 'enabled' : 'disabled'} successfully.`,
			new OrganizationApp(result).toPublic(),
		);
	}

	@Get()
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard)
	public async find(
		@Req() req: Request & { user: User },
		@Query() queryDto: FindOrganizationAppDto,
	) {
		const orgId = req.user.organizationId;

		if (!orgId) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Organization not found for user.',
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		const page = queryDto.page ? parseInt(queryDto.page, 10) : 1;
		const limit = queryDto.limit ? parseInt(queryDto.limit, 10) : 50;

		const result = await this.organizationAppService
			.findPaginated(
				{
					skip: (page - 1) * limit,
					take: limit,
					order: {
						[queryDto.sortBy || 'createdAt']:
							queryDto.order?.toUpperCase() === 'ASC'
								? 'ASC'
								: 'DESC',
					},
				},
				{ organizationId: orgId },
			)
			.catch((_err) => {
				return null;
			});

		if (!result) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					'Error loading organization apps.',
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		return new ResponseEnvelope(ResponseStatus.Success, undefined, result);
	}
}
