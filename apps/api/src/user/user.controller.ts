import {
	Controller,
	Post,
	UseGuards,
	Body,
	HttpException,
	HttpStatus,
	Param,
	Req,
	Put,
	Get,
	Query,
	DefaultValuePipe,
	Res
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';

import { Roles } from './auth/roles.decorator';
import { RolesGuard } from './auth/roles.guard';
import { HasOrganizationAccessGuard } from '../organization/guards/has-organization-access.guard';

import { GetAllUserOptions, GetUserOptions, UserService } from './user.service';
import { User } from './user.entity';
import { UserRole } from './user-role.enum';
import { Utils } from './user.utils';

import { OrganizationService } from '../organization/organization.service';
import { Organization } from '../organization/organization.entity';
import { Utils as OrgUtils } from '../organization/organization.utils';
import { AuthenticationStrategyService } from '../authentication-strategy/authentication-strategy.service';

import { UserAddDto } from './dtos/user-add.dto';
import { UserUpdateDto } from './dtos/user-update.dto';
import { Any, FindManyOptions } from 'typeorm';
import { UsersFilterDto } from './dtos/user-filter.dto';
import { FraudPrevention } from '../_core/fraud-prevention/fraud-prevention';
import { SortStrategy } from '../_core/models/sort-strategy';
import { ResponseEnvelope, ResponseEnvelopeFind, ResponseStatus } from '../_core/models';

const basePath = 'admin/organization/:orgId/user';
@Controller(basePath)
export class UserController {
	constructor(
		private readonly userService: UserService,
		private readonly organizationService: OrganizationService,
		private readonly authenticationStrategyService: AuthenticationStrategyService
	) {}

	@Get()
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getUsers(
		@Param('orgId') orgId: string,
		@Query('sortBy') sortBy: string,
		@Query('order') sortOrder: string
	) {
		const organization: Organization = await this.organizationService
			.findOne({
				where: {
					id: orgId
				},
				loadEagerRelations: false
			})
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!organization) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Organization not found.`),
				HttpStatus.NOT_FOUND
			);
		}

		const options: GetAllUserOptions = {
			sortOrder: sortOrder == 'asc' ? SortStrategy.ASC : SortStrategy.DESC,
			sortBy: sortBy || ''
		};

		const users = (await this.userService.getAllUsers(options)
			.catch(err => {
				console.log(err);
				return [];
			})) as User[];

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			users.map(u => new User(u).toPublic())
		);
	}

	@Post()
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async create(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Body() addReq: UserAddDto
	) {
		if(!Utils.canUserAddRole(req.user.role, addReq.role)) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Error, `You don't have permission to add users with role: '${addReq.role}.`),
				HttpStatus.BAD_REQUEST
			);
		}

		const authenticationStrategy = await this.authenticationStrategyService
			.find({
				where: {
					id: addReq.authenticationStrategyId,
					organizationId: orgId
				},
				loadEagerRelations: false
			})
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!authenticationStrategy) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Invalid Authentication Strategy provided.`),
				HttpStatus.BAD_REQUEST
			);
		}

		if(addReq.permissions?.length && req.user.role !== UserRole.SuperAdmin) {
			for(const p of addReq.permissions) {
				if(!Utils.hasPermission(req.user, p.type)) {
					throw new HttpException(
						new ResponseEnvelope(ResponseStatus.Failure, `You don't have permission to add users with permission: '${p}.`),
						HttpStatus.BAD_REQUEST
					);
				}
			}
		}

		const user: User = await this.userService
			.addOne(
				new User({
					email: addReq.email,
					emailNormalized: FraudPrevention.Forms.Normalization.normalizeEmail(addReq.email),
					role: addReq.role,
					organizationId: orgId,
					authenticationStrategyId: addReq.authenticationStrategyId,
					deactivated: addReq.deactivated,
					profile: addReq.profile,
					permissions: addReq.permissions
				})
			)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!user) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Error creating user.`),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		user.authenticationStrategy = authenticationStrategy[0];


		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new User(user).toPublic()
		);
	}

	@Put(':id')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async update(
		@Req() req,
		@Param('orgId') orgId: string,
		@Param('id') id: string,
		@Body() updateReq: UserUpdateDto
	) {
		const existingUser: User = await this.userService
			.findOne({
				where: {
					id,
					organizationId: orgId
				},
				loadEagerRelations: false
			})
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!existingUser) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `User not found.`),
				HttpStatus.NOT_FOUND
			);
		}

		if(!Utils.canUserAddRole(req.user.role, existingUser.role)) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `You don't have access to modify this user.`),
				HttpStatus.BAD_REQUEST
			);
		}

		const user: User = new User({
			id: existingUser.id
		});

		if(updateReq.role) {
			if(!Utils.canUserAddRole(req.user.role, updateReq.role)) {
				throw new HttpException(
					new ResponseEnvelope(ResponseStatus.Failure, `You don't have permission to add users with role: '${updateReq.role}.`),
					HttpStatus.BAD_REQUEST
				);
			}
			user.role = updateReq.role;
		}

		if(updateReq.authenticationStrategyId) {
			const authenticationStrategy = await this.authenticationStrategyService
				.find({
					where: {
						id: updateReq.authenticationStrategyId,
						organizationId: orgId
					},
					loadEagerRelations: false
				})
				.catch(err => {
					console.log(err);
					return null;
				});

			if(!authenticationStrategy) {
				throw new HttpException(
					new ResponseEnvelope(ResponseStatus.Failure, `Invalid Authentication Strategy provided.`),
					HttpStatus.BAD_REQUEST
				);
			}

			user.authenticationStrategyId = updateReq.authenticationStrategyId;
		}

		if(updateReq.permissions?.length && req.user.role !== UserRole.SuperAdmin) {
			for(const p of updateReq.permissions) {
				if(!Utils.hasPermission(req.user, p.type)) {
					throw new HttpException(
						new ResponseEnvelope(ResponseStatus.Failure, `You don't have permission to add users with permission: '${p}.`),
						HttpStatus.BAD_REQUEST
					);
				}
			}
		}

		if(updateReq.permissions?.length) {
			user.permissions = updateReq.permissions;
		}

		if(typeof updateReq.profile !== 'undefined') {
			user.profile = updateReq.profile;
		}

		if(typeof updateReq.deactivated !== 'undefined') {
			user.deactivated = updateReq.deactivated;
		}

		const updated: User = await this.userService.updateOne(user)
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!updated) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Error updating user.`),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new User(updated).toPublic()
		);
	}

	@Post('find')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getUsersPaginated(
		@Param('orgId') orgId: string,
		@Body() filter: UsersFilterDto,
		@Query('page', new DefaultValuePipe(1)) page: number,
		@Query('perPage', new DefaultValuePipe(5)) perPage: number,
		@Query('sortBy') sortBy: string,
		@Query('order', new DefaultValuePipe('ASC')) sortOrder: SortStrategy
	) {
		perPage = perPage > 50 ? 50 : perPage;
		const options: GetUserOptions = {
			orgId,
			page,
			perPage
		};

		if(sortBy) {
			options.sortBy = sortBy;
			options.sortOrder = sortOrder;
		}

		let error;
		const queryResult = await this.userService
			.getUsersPaginated(options, filter)
			.catch(err => {
				console.log(err);
				error = err;
				return null;
			});

		if(!queryResult?.length && error) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `Error getting Users.`),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		} else if(!queryResult?.length) {
			return new ResponseEnvelopeFind(
				ResponseStatus.Success,
				undefined,
				{
					page,
					perPage,
					numPages: 1,
					totalResults: null,
					results: [],
					endpoint: `${basePath.replace(':orgId', orgId)}/find`
				}
			);
		}

		const count = queryResult[0].count;
		return new ResponseEnvelopeFind(
			ResponseStatus.Success,
			undefined,
			{
				page,
				perPage,
				numPages: Math.ceil(count / perPage) || 1,
				totalResults: count,
				results: queryResult.map(r => new User(r).toPublic()),
				endpoint: `${basePath.replace(':orgId', orgId)}/find`
			}
		);
	}

	@Get(':id')
	@Roles(UserRole.SuperAdmin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getUser(
		@Param('orgId') orgId: string,
		@Param('id') id: string
	) {
		const user: User = await this.userService
			.findOne({
				where: {
					id,
					organizationId: orgId
				},
				loadEagerRelations: false,
				// load campaign name from permission
				relations: ['permissions', 'permissions.campaign']
			})
			.catch(err => {
				console.log(err);
				return null;
			});

		if(!user) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `User not found.`),
				HttpStatus.NOT_FOUND
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new User(user).toPublic()
		);
	}
}
