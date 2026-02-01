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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { HasOrganizationAccessGuard } from '../organization/guards/has-organization-access.guard';
import { OrganizationService } from '../organization/organization.service';
import { Organization } from '../organization/organization.entity';
import { AuthenticationStrategyService } from '../authentication-strategy/authentication-strategy.service';
import { FraudPrevention } from '../_core/fraud-prevention/fraud-prevention';
import { SortStrategy } from '../_core/models/sort-strategy';
import {
	ResponseEnvelope,
	ResponseEnvelopeFind,
	ResponseStatus,
} from '../_core/models';

import { Roles } from './auth/roles.decorator';
import { RolesGuard } from './auth/roles.guard';
import { GetAllUserOptions, GetUserOptions, UserService } from './user.service';
import { User } from './user.entity';
import { UserRole } from './user-role.enum';
import { Utils } from './user.utils';
import { Permission } from './permission/permission.entity';
import { UserAddDto } from './dtos/user-add.dto';
import { UserUpdateDto } from './dtos/user-update.dto';
import { UserPromoteDto } from './dtos/user-promote.dto';
import { UserBanDto } from './dtos/user-ban.dto';
import { UsersFilterDto } from './dtos/user-filter.dto';


const basePath = 'admin/organization/:orgId/user';
@Controller(basePath)
export class UserController {
	constructor(
		private readonly userService: UserService,
		private readonly organizationService: OrganizationService,
		private readonly authenticationStrategyService: AuthenticationStrategyService,
	) {}

	@Get()
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getUsers(
		@Param('orgId') orgId: string,
		@Query('sortBy') sortBy: string,
		@Query('order') sortOrder: string,
		@Query('query') query?: string,
	) {
		const organization: Organization | null = await this.organizationService
			.findOne({
				where: {
					id: orgId,
				},
				loadEagerRelations: false,
			})
			.catch((err) => {
				console.log(err);
				return null;
			});

		if (!organization) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`Organization not found.`,
				),
				HttpStatus.NOT_FOUND,
			);
		}

		const options: GetAllUserOptions = {
			sortOrder:
				sortOrder == 'asc' ? SortStrategy.ASC : SortStrategy.DESC,
			sortBy: sortBy || '',
			query: query || '',
		};

		const users = (await this.userService
			.getAllUsers(options)
			.catch((err) => {
				console.log(err);
				return [];
			})) as User[];

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			users.map((u) => new User(u).toPublic()),
		);
	}

	@Post()
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async create(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Body() addReq: UserAddDto,
	) {
		if (!Utils.canUserAddRole(req.user.role ?? '', addReq.role)) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Error,
					`You don't have permission to add users with role: '${addReq.role}.`,
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		// Get the organization to check for default auth strategy
		const organization: Organization | null = await this.organizationService
			.findOne({
				where: { id: orgId },
				loadEagerRelations: false,
			})
			.catch((err) => {
				console.log(err);
				return null;
			});

		if (!organization) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`Organization not found.`,
				),
				HttpStatus.NOT_FOUND,
			);
		}

		let authenticationStrategyId: string | null = null;

		if (addReq.authenticationStrategyId) {
			// Validate the provided auth strategy exists
			const authStrategy = await this.authenticationStrategyService
				.findOne({
					where: {
						id: addReq.authenticationStrategyId,
						organizationId: orgId,
					},
					loadEagerRelations: false,
				})
				.catch((err) => {
					console.log(err);
					return null;
				});

			if (!authStrategy) {
				throw new HttpException(
					new ResponseEnvelope(
						ResponseStatus.Failure,
						`Invalid Authentication Strategy provided.`,
					),
					HttpStatus.BAD_REQUEST,
				);
			}
			authenticationStrategyId = authStrategy.id;
		} else if (organization.defaultAuthenticationStrategyId) {
			// Use the organization's default auth strategy
			authenticationStrategyId =
				organization.defaultAuthenticationStrategyId;
		} else {
			// Try to find any available auth strategy for the organization
			const authStrategy = await this.authenticationStrategyService
				.findOne({
					where: {
						organizationId: orgId,
					},
					loadEagerRelations: false,
				})
				.catch((err) => {
					console.log(err);
					return null;
				});

			if (authStrategy) {
				authenticationStrategyId = authStrategy.id;
			}
		}

		if (
			addReq.permissions?.length &&
			req.user.role !== UserRole.SuperAdmin
		) {
			for (const p of addReq.permissions) {
				if (!Utils.hasPermission(req.user, p.type)) {
					throw new HttpException(
						new ResponseEnvelope(
							ResponseStatus.Failure,
							`You don't have permission to add users with permission: '${p}.`,
						),
						HttpStatus.BAD_REQUEST,
					);
				}
			}
		}

		const user: User | null = await this.userService
			.addOne(
				new User({
					email: addReq.email,
					emailNormalized:
						FraudPrevention.Forms.Normalization.normalizeEmail(
							addReq.email,
						),
					role: addReq.role,
					organizationId: orgId,
					authenticationStrategyId: authenticationStrategyId,
					deactivated: addReq.deactivated,
					profile: addReq.profile,
					permissions: addReq.permissions as Partial<Permission>[],
				}),
			)
			.catch((err) => {
				console.log(err);
				return null;
			});

		if (!user) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`Error creating user.`,
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new User(user).toPublic(),
		);
	}

	@Put(':id')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async update(
		@Req() req: any,
		@Param('orgId') orgId: string,
		@Param('id') id: string,
		@Body() updateReq: UserUpdateDto,
	) {
		const existingUser: User | null = await this.userService
			.findOne({
				where: {
					id,
					organizationId: orgId,
				},
				loadEagerRelations: false,
			})
			.catch((err) => {
				console.log(err);
				return null;
			});

		if (!existingUser) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `User not found.`),
				HttpStatus.NOT_FOUND,
			);
		}

		if (
			!Utils.canUserAddRole(req.user.role ?? '', existingUser.role ?? '')
		) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`You don't have access to modify this user.`,
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		const user: User = new User({
			id: existingUser.id,
		});

		if (updateReq.role) {
			if (!Utils.canUserAddRole(req.user.role ?? '', updateReq.role)) {
				throw new HttpException(
					new ResponseEnvelope(
						ResponseStatus.Failure,
						`You don't have permission to add users with role: '${updateReq.role}.`,
					),
					HttpStatus.BAD_REQUEST,
				);
			}
			user.role = updateReq.role;
		}

		if (updateReq.authenticationStrategyId) {
			const authenticationStrategy =
				await this.authenticationStrategyService
					.find({
						where: {
							id: updateReq.authenticationStrategyId,
							organizationId: orgId,
						},
						loadEagerRelations: false,
					})
					.catch((err) => {
						console.log(err);
						return null;
					});

			if (!authenticationStrategy) {
				throw new HttpException(
					new ResponseEnvelope(
						ResponseStatus.Failure,
						`Invalid Authentication Strategy provided.`,
					),
					HttpStatus.BAD_REQUEST,
				);
			}

			user.authenticationStrategyId = updateReq.authenticationStrategyId;
		}

		if (
			updateReq.permissions?.length &&
			req.user.role !== UserRole.SuperAdmin
		) {
			for (const p of updateReq.permissions) {
				if (!Utils.hasPermission(req.user, p.type)) {
					throw new HttpException(
						new ResponseEnvelope(
							ResponseStatus.Failure,
							`You don't have permission to add users with permission: '${p}.`,
						),
						HttpStatus.BAD_REQUEST,
					);
				}
			}
		}

		if (updateReq.permissions?.length) {
			user.permissions = updateReq.permissions as Partial<Permission>[];
		}

		if (typeof updateReq.profile !== 'undefined') {
			user.profile = updateReq.profile;
		}

		if (typeof updateReq.deactivated !== 'undefined') {
			user.deactivated = updateReq.deactivated;
		}

		const updated: User | null = await this.userService
			.updateOne(user)
			.catch((err) => {
				console.log(err);
				return null;
			});

		if (!updated) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`Error updating user.`,
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new User(updated).toPublic(),
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
		@Query('order', new DefaultValuePipe('ASC')) sortOrder: SortStrategy,
	) {
		perPage = perPage > 50 ? 50 : perPage;
		const options: GetUserOptions = {
			orgId,
			page,
			perPage,
		};

		if (sortBy) {
			options.sortBy = sortBy;
			options.sortOrder = sortOrder;
		}

		let error;
		const queryResult = await this.userService
			.getUsersPaginated(options, filter)
			.catch((err) => {
				console.log(err);
				error = err;
				return null;
			});

		if (!queryResult?.length && error) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`Error getting Users.`,
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		} else if (!queryResult?.length) {
			return new ResponseEnvelopeFind(ResponseStatus.Success, undefined, {
				page,
				perPage,
				numPages: 1,
				totalResults: null,
				results: [],
				endpoint: `${basePath.replace(':orgId', orgId)}/find`,
			});
		}

		const count = queryResult[0].count;
		return new ResponseEnvelopeFind(ResponseStatus.Success, undefined, {
			page,
			perPage,
			numPages: Math.ceil(count / perPage) || 1,
			totalResults: count,
			results: queryResult.map((r: any) => new User(r).toPublic()),
			endpoint: `${basePath.replace(':orgId', orgId)}/find`,
		});
	}

	@Get(':id')
	@Roles(UserRole.SuperAdmin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async getUser(
		@Param('orgId') orgId: string,
		@Param('id') id: string,
	) {
		const user: User | null = await this.userService
			.findOne({
				where: {
					id,
					organizationId: orgId,
				},
				loadEagerRelations: false,
				// load campaign name from permission
				relations: ['permissions', 'permissions.campaign'],
			})
			.catch((err) => {
				console.log(err);
				return null;
			});

		if (!user) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `User not found.`),
				HttpStatus.NOT_FOUND,
			);
		}

		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new User(user).toPublic(),
		);
	}

	@Post('promote')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async promoteUser(
		@Req() req: Request & { user: User },
		@Param('orgId') _orgId: string,
		@Body() promoteDto: UserPromoteDto,
	) {
		// Prevent self-promotion
		if (req.user.id === promoteDto.userId) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`You cannot promote yourself.`,
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		// Validate the requesting user can promote to the target role
		if (!Utils.canUserAddRole(req.user.role ?? '', promoteDto.targetRole)) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`You don't have permission to promote users to role: '${promoteDto.targetRole}'.`,
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		const updatedUser = await this.userService
			.promoteUser(promoteDto.userId, promoteDto.targetRole, req.user)
			.catch((err) => {
				console.log(err);
				throw new HttpException(
					new ResponseEnvelope(
						ResponseStatus.Failure,
						err.message || 'Error promoting user.',
					),
					HttpStatus.INTERNAL_SERVER_ERROR,
				);
			});

		return new ResponseEnvelope(
			ResponseStatus.Success,
			'User promoted successfully.',
			new User(updatedUser).toPublic(),
		);
	}

	@Post('ban')
	@Roles(UserRole.SuperAdmin, UserRole.Admin)
	@UseGuards(AuthGuard(), RolesGuard, HasOrganizationAccessGuard)
	public async banUser(
		@Req() req: Request & { user: User },
		@Param('orgId') orgId: string,
		@Body() banDto: UserBanDto,
	) {
		// Prevent self-banning
		if (req.user.id === banDto.userId) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Failure,
					`You cannot ban yourself.`,
				),
				HttpStatus.BAD_REQUEST,
			);
		}

		// Verify the user belongs to the organization
		const userToBan = await this.userService
			.findOne({
				where: { id: banDto.userId, organizationId: orgId },
			})
			.catch((err) => {
				console.log(err);
				return null;
			});

		if (!userToBan) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Failure, `User not found.`),
				HttpStatus.NOT_FOUND,
			);
		}

		const updatedUser = await this.userService
			.banUser(banDto.userId, banDto.banned)
			.catch((err) => {
				console.log(err);
				throw new HttpException(
					new ResponseEnvelope(
						ResponseStatus.Failure,
						'Error updating user status.',
					),
					HttpStatus.INTERNAL_SERVER_ERROR,
				);
			});

		return new ResponseEnvelope(
			ResponseStatus.Success,
			banDto.banned
				? 'User banned successfully.'
				: 'User unbanned successfully.',
			new User(updatedUser).toPublic(),
		);
	}
}
