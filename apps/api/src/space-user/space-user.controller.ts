import {
	Controller,
	Get,
	Post,
	Patch,
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
import { SpaceAdminGuard } from '../space/guards/space-admin.guard';
import { SpaceUserService } from './space-user.service';
import { SpaceUser } from './space-user.entity';
import { SpaceUserInviteDto, SpaceUserUpdateRoleDto } from './dtos';
import { UserRole } from '../user/user-role.enum';
import { User } from '../user/user.entity';
import { ResponseEnvelope, ResponseStatus } from '../_core/models';

const basePath = 'space/:spaceId/users';

@Controller(basePath)
export class SpaceUserController {
	constructor(private readonly spaceUserService: SpaceUserService) {}

	@Get()
	@UseGuards(AuthGuard(), RolesGuard, SpaceAdminGuard)
	public async getSpaceUsers(
		@Req() req: Request & { user: User },
		@Param('spaceId') spaceId: string,
		@Query('query') query?: string,
		@Query('sortBy') sortBy?: string,
		@Query('order') order?: string,
		@Query('page') page?: string,
		@Query('limit') limit?: string
	) {
		const pageNum = page ? parseInt(page, 10) : undefined;
		const limitNum = limit ? parseInt(limit, 10) : undefined;

		const result = await this.spaceUserService
			.findSpaceUsers(spaceId, query, sortBy, order, pageNum, limitNum)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!result) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Error loading space users.`),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			result
		);
	}

	@Post()
	@UseGuards(AuthGuard(), RolesGuard, SpaceAdminGuard)
	public async inviteUser(
		@Req() req: Request & { user: User },
		@Param('spaceId') spaceId: string,
		@Body() inviteDto: SpaceUserInviteDto
	) {
		const spaceUser = await this.spaceUserService
			.addUserToSpaceByEmail(spaceId, inviteDto.email, inviteDto.role, req.user.organizationId)
			.catch(err => {
				console.log(err);
				if(err.message === 'User is already a member of this space') {
					throw new HttpException(
						new ResponseEnvelope(ResponseStatus.Failure, err.message),
						HttpStatus.BAD_REQUEST
					);
				}
				return null;
			});

		if(!spaceUser) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Error inviting user to space.`),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'User invited successfully.',
			new SpaceUser(spaceUser).toPublic()
		);
	}

	@Patch(':userId')
	@UseGuards(AuthGuard(), RolesGuard, SpaceAdminGuard)
	public async updateUserRole(
		@Req() req: Request & { user: User },
		@Param('spaceId') spaceId: string,
		@Param('userId') userId: string,
		@Body() updateDto: SpaceUserUpdateRoleDto
	) {
		const spaceUser = await this.spaceUserService
			.updateUserRole(spaceId, userId, updateDto.role)
			.catch(err => {
				console.log(err);
				if(err.message === 'User is not a member of this space') {
					throw new HttpException(
						new ResponseEnvelope(ResponseStatus.Failure, err.message),
						HttpStatus.NOT_FOUND
					);
				}
				return null;
			});

		if(!spaceUser) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Error updating user role.`),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'User role updated successfully.',
			new SpaceUser(spaceUser).toPublic()
		);
	}

	@Delete(':userId')
	@UseGuards(AuthGuard(), RolesGuard, SpaceAdminGuard)
	public async removeUser(
		@Req() req: Request & { user: User },
		@Param('spaceId') spaceId: string,
		@Param('userId') userId: string
	) {
		const result = await this.spaceUserService
			.removeUserFromSpace(spaceId, userId)
			.catch(err => {
				console.log(err);
				if(err.message === 'User is not a member of this space') {
					throw new HttpException(
						new ResponseEnvelope(ResponseStatus.Failure, err.message),
						HttpStatus.NOT_FOUND
					);
				}
				return null;
			});

		if(!result) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Error removing user from space.`),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'User removed from space successfully.'
		);
	}
}
