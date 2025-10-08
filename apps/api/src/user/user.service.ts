import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
	Repository,
	FindOneOptions,
	FindManyOptions,
	DataSource
} from 'typeorm';

import { UsersFilterDto } from './dtos/user-filter.dto';

import { User } from './user.entity';
import { UserRole } from './user-role.enum';
import { Utils } from './user.utils';
import { SortStrategy } from '../_core/models/sort-strategy';
import { FraudPrevention } from '../_core/fraud-prevention/fraud-prevention';

export class AccessList {
	organizationId: string;
}
export class GetUserOptions {
	orgId: string;
	page: number;
	perPage: number;
	sortBy?: string;
	sortOrder?: SortStrategy;
}

export class GetAllUserOptions {
	sortBy: string;
	sortOrder: SortStrategy;
	query?: string;
}
@Injectable()
export class UserService {
	private readonly debug = process.env.DEBUG || false;

	constructor(
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
		private readonly dataSource: DataSource
	) {}

	public async find(options: FindManyOptions<User>) {
		return this.userRepository.find(options);
	}

	public async findOne(options: FindOneOptions<User>) {
		return this.userRepository.findOne(options);
	}

	public async addOne(user: Partial<User>) {
		if(!user.email) {
			throw 'Invalid user. Missing email.';
		}
		user.emailNormalized = FraudPrevention.Forms.Normalization.normalizeEmail(user.email);
		return this.userRepository.save(user);
	}

	public async updateOne(user: Partial<User>) {
		user.lastSeen = 'NOW()';
		return this.userRepository.save(user);
	}

	public async save(user: User) {
		return this.userRepository.save(user);
	}

	public async canAccess(user: User, accessList: AccessList) {
		if(user.organizationId !== accessList.organizationId) {
			return false;
		}

		return true;
	}

	public async getUserRaw(id: string) {
		const conn = this.dataSource;
		const queryAlias = 'u';

		const query = `
			SELECT
				${queryAlias}.id,
				${queryAlias}.email,
				${queryAlias}."emailNormalized",
				${queryAlias}."organizationId",
				${queryAlias}."role",
				${queryAlias}.created,
				${queryAlias}."activationStatus",
				${queryAlias}."deactivated",
				${queryAlias}."singlePass",
				${queryAlias}."singlePassExpire",
				${queryAlias}."authenticationStrategyId",
				${queryAlias}."authTokens",
				${queryAlias}."lastSeen",
				${queryAlias}."privateProfile",
				${queryAlias}."profile",
				(
					SELECT ARRAY (
						SELECT
							ROW_TO_JSON(pms)
						FROM
							permissions AS pms
						WHERE
							pms."userId" = ${queryAlias}.id
					)
				) AS permissions
			FROM
				"users" AS ${queryAlias}
			WHERE
				${queryAlias}.id = :id
			GROUP BY
				${queryAlias}.id
		`;
		const params = {
			id
		};

		let error;
		const result = await conn
			.query(...conn.driver.escapeQueryWithParameters(query, params, {}))
			.catch(err => {
				console.log(err);
				error = err;
				return null;
			});

		if(!result?.length) {
			if(error) {
				throw new Error('An error occurred during the user query.');
			}
			throw new Error('User not found.');
		}

		const user = new User(result[0], result[0].privateProfile);

		return user.clean()
			.stripNulls();
	}

	public async getUsersPaginated(options: GetUserOptions, filter: UsersFilterDto) {
		const conn = this.dataSource;
		const { perPage, page, orgId, sortBy, sortOrder } = options;
		const take = perPage || 5;
		const skip = (page - 1) * take;
		const { query, role } = filter;

		const params: any = {
			orgId,
			take,
			skip
		};

		let userQuery = '';
		if(query) {
			params.query = `%${query}%`;
			userQuery = `
				AND (
					u."profile" ->> 'nameLast' ILIKE :query
					OR u."profile" ->> 'nameFirst' ILIKE :query
				)
			`;
		}

		let roleQuery = '';
		if(role) {
			params.role = role;
			roleQuery = `
				AND u.role = :role
			`;
		}

		// TODO: Make sure the sortBy and sortOrder are parameterized.
		let order = ` ORDER BY u."profile" -> 'nameFirst' ${sortOrder ?? 'ASC'}`;
		if(sortBy && sortBy !== 'name') {
			order = ` ORDER BY u."${sortBy}" ${sortOrder ?? 'ASC'}`;
		}

		const q = `
			SELECT
				COUNT(*) OVER() AS count,
				u."id",
				u."email",
				u."profile",
				u."deactivated",
				u."authenticationStrategyId",
				u."role",
				ROW_TO_JSON(a) AS "authenticationStrategy"
			FROM
				"users" AS u
			LEFT JOIN
				"authenticationStrategies" AS a
				ON a.id = u."authenticationStrategyId"
			WHERE
				u."organizationId" = :orgId
				${userQuery}
				${roleQuery}
			${order}
			LIMIT :take
			OFFSET :skip
		`;

		return conn.query(...conn.driver.escapeQueryWithParameters(q, params, {}));
	}

	public async getAllUsers(options: GetAllUserOptions) {
		const { sortBy, sortOrder, query } = options;
		const qb = this.userRepository
			.createQueryBuilder('user')
			.leftJoinAndSelect('user.authenticationStrategy', 'authenticationStrategy');

		// Add search filter if query is provided
		if(query && query.trim()) {
			qb.where(
				`(LOWER(user.email) LIKE LOWER(:query) OR
				 LOWER(user.profile ->> 'nameFirst') LIKE LOWER(:query) OR
				 LOWER(user.profile ->> 'nameLast') LIKE LOWER(:query))`,
				{ query: `%${query}%` }
			);
		}

		if(sortBy && sortBy != 'name') {
			qb.orderBy(`user.${sortBy}`, sortOrder ?? 'ASC');
		}

		if(sortBy && sortBy === 'name') {
			qb.orderBy(`user.profile ->> 'nameFirst'`, sortOrder ?? 'ASC');
		}

		return qb.getMany();
	}

	public async promoteUser(userId: string, targetRole: UserRole, requestingUser: User) {
		// Validate the requesting user can promote to the target role
		if(!Utils.canUserAddRole(requestingUser.role, targetRole)) {
			throw new Error(`You don't have permission to promote users to role: ${targetRole}`);
		}

		const user = await this.findOne({
			where: { id: userId }
		});

		if(!user) {
			throw new Error('User not found.');
		}

		// Ensure organization isolation
		if(user.organizationId !== requestingUser.organizationId) {
			throw new Error('You don\'t have access to this user.');
		}

		// Update the user's role
		user.role = targetRole;
		return this.updateOne(user);
	}

	public async banUser(userId: string, banned: boolean) {
		const user = await this.findOne({
			where: { id: userId }
		});

		if(!user) {
			throw new Error('User not found.');
		}

		user.deactivated = banned;
		return this.updateOne(user);
	}
}
