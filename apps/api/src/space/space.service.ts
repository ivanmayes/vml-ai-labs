import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOneOptions, FindManyOptions } from 'typeorm';

import { Space } from './space.entity';
import { SpacePublicDetailsDto } from './dtos/space-public-details.dto';

@Injectable()
export class SpaceService {
	constructor(
		@InjectRepository(Space)
		private readonly spaceRepository: Repository<Space>
	) {}

	public async find(options: FindManyOptions<Space>) {
		return this.spaceRepository.find(options);
	}

	public async findOne(options: FindOneOptions<Space>) {
		return this.spaceRepository.findOne(options);
	}

	public async create(space: Partial<Space>) {
		return this.spaceRepository.save(space);
	}

	public async update(space: Partial<Space>) {
		return this.spaceRepository.save(space);
	}

	public async delete(id: string) {
		return this.spaceRepository.delete(id);
	}

	public async findSpaces(orgId: string, query?: string, sortBy?: string, sortOrder?: string) {
		const qb = this.spaceRepository
			.createQueryBuilder('space')
			.where('space.organizationId = :orgId', { orgId });

		// Add search filter if query is provided
		if(query && query.trim()) {
			qb.andWhere('LOWER(space.name) LIKE LOWER(:query)', {
				query: `%${query}%`
			});
		}

		// Add sorting
		const field = sortBy || 'created';
		const order = (sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC') as 'ASC' | 'DESC';
		qb.orderBy(`space.${field}`, order);

		return qb.getMany();
	}

	public async updateSettings(
		spaceId: string,
		updates: { name?: string; isPublic?: boolean; settings?: Record<string, any> }
	) {
		const space = await this.spaceRepository.findOne({ where: { id: spaceId } });

		if(!space) {
			throw new Error('Space not found');
		}

		if(updates.name !== undefined) {
			space.name = updates.name;
		}

		if(updates.isPublic !== undefined) {
			space.isPublic = updates.isPublic;
		}

		if(updates.settings !== undefined) {
			// Merge settings, preserving existing values not being updated
			space.settings = {
				...space.settings,
				...updates.settings
			};
		}

		return this.spaceRepository.save(space);
	}

	public async getPublicDetails(spaceId: string): Promise<SpacePublicDetailsDto> {
		const space = await this.spaceRepository.findOne({
			where: { id: spaceId },
			select: ['name']
		});

		if(!space) {
			throw new Error('Space not found');
		}

		return new SpacePublicDetailsDto(space.name);
	}
}
