import {
	Controller,
	Get,
	Post,
	Put,
	Delete,
	Body,
	Param,
	UseGuards,
	HttpException,
	HttpStatus,
	Req,
	Query
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { Roles } from '../user/auth/roles.decorator';
import { RolesGuard } from '../user/auth/roles.guard';
import { HasOrganizationAccessGuard } from '../organization/guards/has-organization-access.guard';

import { SpaceService } from './space.service';
import { Space } from './space.entity';
import { SpaceCreateDto, SpaceUpdateDto } from './dtos';
import { SpaceUpdateSettingsDto } from './dtos/space-update-settings.dto';
import { SpaceAdminGuard } from './guards/space-admin.guard';
import { SpaceAccessGuard } from './guards/space-access.guard';
import { UserRole } from '../user/user-role.enum';
import { User } from '../user/user.entity';
import { ResponseEnvelope, ResponseStatus } from '../_core/models';
import { SpaceUserService } from '../space-user/space-user.service';

const basePath = 'organization/:orgId/admin/spaces';

@Controller(basePath)
export class SpaceController {
	constructor(private readonly spaceService: SpaceService) {}

	@Get()
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getSpaces(
		@Param('orgId') orgId: string,
		@Query('query') query?: string,
		@Query('sortBy') sortBy?: string,
		@Query('order') order?: string
	) {
		const spaces = await this.spaceService
			.findSpaces(orgId, query, sortBy, order)
			.catch(err => {
				console.log(err);
				return [];
			});

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			spaces.map(s => new Space(s).toPublic())
		);
	}

	@Post()
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async createSpace(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Body() createDto: SpaceCreateDto
	) {
		// Verify the organization ID matches the user's organization
		if(req.user.organizationId !== orgId) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `You don't have access to this organization.`),
				HttpStatus.FORBIDDEN
			);
		}

		const space = await this.spaceService
			.create(
				new Space({
					name: createDto.name,
					organizationId: orgId
				})
			)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!space) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Error creating space.`),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new Space(space).toPublic()
		);
	}

	@Put(':id')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async updateSpace(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Param('id') id: string,
		@Body() updateDto: SpaceUpdateDto
	) {
		// Verify the space belongs to the organization
		const existingSpace = await this.spaceService
			.findOne({
				where: { id, organizationId: orgId }
			})
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!existingSpace) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Space not found.`),
				HttpStatus.NOT_FOUND
			);
		}

		// Verify the organization ID matches the user's organization
		if(req.user.organizationId !== orgId) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `You don't have access to this organization.`),
				HttpStatus.FORBIDDEN
			);
		}

		const space = new Space({
			id: existingSpace.id,
			name: updateDto.name,
			isPublic: updateDto.isPublic !== undefined ? updateDto.isPublic : existingSpace.isPublic
		});

		const updated = await this.spaceService
			.update(space)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!updated) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Error updating space.`),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new Space(updated).toPublic()
		);
	}

	@Delete(':id')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async deleteSpace(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Param('id') id: string
	) {
		// Verify the space belongs to the organization
		const existingSpace = await this.spaceService
			.findOne({
				where: { id, organizationId: orgId }
			})
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!existingSpace) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Space not found.`),
				HttpStatus.NOT_FOUND
			);
		}

		// Verify the organization ID matches the user's organization
		if(req.user.organizationId !== orgId) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `You don't have access to this organization.`),
				HttpStatus.FORBIDDEN
			);
		}

		const result = await this.spaceService
			.delete(id)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!result) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Error deleting space.`),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Space deleted successfully.'
		);
	}

	@Put(':id/settings')
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard, SpaceAdminGuard)
	public async updateSettings(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Param('id') id: string,
		@Body() settingsDto: SpaceUpdateSettingsDto
	) {
		// Verify the space belongs to the organization
		const existingSpace = await this.spaceService
			.findOne({
				where: { id, organizationId: orgId }
			})
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!existingSpace) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Space not found.`),
				HttpStatus.NOT_FOUND
			);
		}

		const updated = await this.spaceService
			.updateSettings(id, settingsDto)
			.catch(err => {
				console.log(err);
				if(err.message === 'Space not found') {
					throw new HttpException(
						new ResponseEnvelope(ResponseStatus.Failure, err.message),
						HttpStatus.NOT_FOUND
					);
				}
				return null;
			});

		if(!updated) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Error updating space settings.`),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'Space settings updated successfully.',
			new Space(updated).toPublic()
		);
	}
}

@Controller('spaces')
export class SpacePublicController {
	constructor(
		private readonly spaceService: SpaceService,
		private readonly spaceUserService: SpaceUserService
	) {}

	@Get(':id')
	@UseGuards(AuthGuard())
	public async getSpace(
		@Req() req: Request & { user: User },
		@Param('id') id: string
	) {
		// Find the space
		const space = await this.spaceService
			.findOne({ where: { id } })
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!space) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, 'Space not found.'),
				HttpStatus.NOT_FOUND
			);
		}

		// Check authorization
		// Admins and SuperAdmins have access to all spaces
		const hasAdminAccess = req.user.role === UserRole.SuperAdmin || req.user.role === UserRole.Admin;

		// Check if user has access to this space
		const hasAccess = await this.spaceUserService
			.hasSpaceAccess(id, req.user.id, req.user.role, space.isPublic)
			.catch(err => {
				console.log(err);
				return false;
			});

		if(!hasAdminAccess && !hasAccess) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, 'You do not have access to this space.'),
				HttpStatus.FORBIDDEN
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new Space(space).toPublic()
		);
	}

	@Get(':id/public')
	@UseGuards(AuthGuard(), SpaceAccessGuard)
	public async getPublicDetails(
		@Req() req: Request & { user: User },
		@Param('id') id: string
	) {
		const details = await this.spaceService
			.getPublicDetails(id)
			.catch(err => {
				console.log(err);
				if(err.message === 'Space not found') {
					throw new HttpException(
						new ResponseEnvelope(ResponseStatus.Failure, err.message),
						HttpStatus.NOT_FOUND
					);
				}
				return null;
			});

		if(!details) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Error retrieving space details.`),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			details
		);
	}
}
