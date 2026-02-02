import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserRole } from '../user/user-role.enum';
import { User, ActivationStatus } from '../user/user.entity';
import { AuthenticationStrategy } from '../authentication-strategy/authentication-strategy.entity';

import { SpaceRole } from './space-role.enum';
import { SpaceUser } from './space-user.entity';

@Injectable()
export class SpaceUserService {
	constructor(
		@InjectRepository(SpaceUser)
		private readonly spaceUserRepository: Repository<SpaceUser>,
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
		@InjectRepository(AuthenticationStrategy)
		private readonly authStrategyRepository: Repository<AuthenticationStrategy>,
	) {}

	public async findSpaceUsers(
		spaceId: string,
		query?: string,
		sortBy?: string,
		sortOrder?: string,
		page?: number,
		limit?: number,
	) {
		const qb = this.spaceUserRepository
			.createQueryBuilder('spaceUser')
			.leftJoinAndSelect('spaceUser.user', 'user')
			.where('spaceUser.spaceId = :spaceId', { spaceId });

		// Add search filter if query is provided
		if (query && query.trim()) {
			qb.andWhere(
				'(LOWER(user.email) LIKE LOWER(:query) OR LOWER(user.firstName) LIKE LOWER(:query) OR LOWER(user.lastName) LIKE LOWER(:query))',
				{
					query: `%${query}%`,
				},
			);
		}

		// Add sorting
		const field = sortBy || 'createdAt';
		const order = (sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as
			| 'ASC'
			| 'DESC';

		if (
			field === 'email' ||
			field === 'firstName' ||
			field === 'lastName'
		) {
			qb.orderBy(`user.${field}`, order);
		} else {
			qb.orderBy(`spaceUser.${field}`, order);
		}

		// Add pagination
		if (page !== undefined && limit !== undefined) {
			qb.skip((page - 1) * limit).take(limit);
		}

		const [users, total] = await qb.getManyAndCount();

		return {
			users,
			total,
			page: page || 1,
			limit: limit || total,
		};
	}

	public async addUserToSpaceByEmail(
		spaceId: string,
		email: string,
		role: SpaceRole,
		organizationId: string,
	) {
		// Find or create user by email
		let user = await this.userRepository.findOne({
			where: { emailNormalized: email.toLowerCase() },
		});

		// If user doesn't exist, create them
		if (!user) {
			// Find the organization's authentication strategy
			const authStrategy = await this.authStrategyRepository.findOne({
				where: { organizationId },
			});

			if (!authStrategy) {
				throw new Error(
					'No authentication strategy found for organization',
				);
			}

			user = new User({
				email: email,
				emailNormalized: email.toLowerCase(),
				organizationId: organizationId,
				role: UserRole.Guest, // Default role
				activationStatus: ActivationStatus.Pending,
				authenticationStrategyId: authStrategy.id,
			});
			user = await this.userRepository.save(user);
		}

		// Check if user is already in the space
		const existing = await this.spaceUserRepository.findOne({
			where: { spaceId, userId: user.id ?? undefined },
		});

		if (existing) {
			throw new Error('User is already a member of this space');
		}

		const spaceUser = new SpaceUser({
			spaceId,
			userId: user.id ?? undefined,
			role,
		});

		return this.spaceUserRepository.save(spaceUser);
	}

	public async addUserToSpace(
		spaceId: string,
		userId: string,
		role: SpaceRole,
	) {
		// Check if user is already in the space
		const existing = await this.spaceUserRepository.findOne({
			where: { spaceId, userId },
		});

		if (existing) {
			throw new Error('User is already a member of this space');
		}

		const spaceUser = new SpaceUser({
			spaceId,
			userId,
			role,
		});

		return this.spaceUserRepository.save(spaceUser);
	}

	public async updateUserRole(
		spaceId: string,
		userId: string,
		role: SpaceRole,
	) {
		const spaceUser = await this.spaceUserRepository.findOne({
			where: { spaceId, userId },
		});

		if (!spaceUser) {
			throw new Error('User is not a member of this space');
		}

		spaceUser.role = role;
		return this.spaceUserRepository.save(spaceUser);
	}

	public async removeUserFromSpace(spaceId: string, userId: string) {
		const result = await this.spaceUserRepository.delete({
			spaceId,
			userId,
		});

		if (result.affected === 0) {
			throw new Error('User is not a member of this space');
		}

		return result;
	}

	public async getUserSpaceRole(
		spaceId: string,
		userId: string,
	): Promise<SpaceRole | null> {
		const spaceUser = await this.spaceUserRepository.findOne({
			where: { spaceId, userId },
		});

		return spaceUser?.role || null;
	}

	public async isUserSpaceAdmin(
		spaceId: string,
		userId: string,
		userRole: UserRole,
	): Promise<boolean> {
		// Platform admins and super admins have automatic access
		if (userRole === UserRole.SuperAdmin || userRole === UserRole.Admin) {
			return true;
		}

		// Check if user is a space admin
		const spaceUser = await this.spaceUserRepository.findOne({
			where: { spaceId, userId },
		});

		return spaceUser?.role === SpaceRole.SpaceAdmin;
	}

	public async hasSpaceAccess(
		spaceId: string,
		userId: string,
		userRole: UserRole,
		isSpacePublic: boolean,
	): Promise<boolean> {
		// Platform admins and super admins have automatic access
		if (userRole === UserRole.SuperAdmin || userRole === UserRole.Admin) {
			return true;
		}

		// If space is public, any authenticated user has access
		if (isSpacePublic) {
			return true;
		}

		// If space is private, check if user is a member
		const spaceUser = await this.spaceUserRepository.findOne({
			where: { spaceId, userId },
		});

		return !!spaceUser;
	}
}
