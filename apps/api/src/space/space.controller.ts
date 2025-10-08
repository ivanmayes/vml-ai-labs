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
import { UserRole } from '../user/user-role.enum';
import { User } from '../user/user.entity';
import { ResponseEnvelope, ResponseStatus } from '../_core/models';

const basePath = 'organization/:orgId/admin/spaces';

@Controller(basePath)
export class SpaceController {
	constructor(private readonly spaceService: SpaceService) {}

	@Get()
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getSpaces(
		@Param('orgId') orgId: string,
		@Query('query') query?: string
	) {
		const spaces = await this.spaceService
			.findSpaces(orgId, query)
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
			name: updateDto.name
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
}
