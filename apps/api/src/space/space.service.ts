import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOneOptions, FindManyOptions } from 'typeorm';

import { Space } from './space.entity';

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

	public async findSpaces(orgId: string, query?: string) {
		const qb = this.spaceRepository
			.createQueryBuilder('space')
			.where('space.organizationId = :orgId', { orgId });

		// Add search filter if query is provided
		if(query && query.trim()) {
			qb.andWhere('LOWER(space.name) LIKE LOWER(:query)', {
				query: `%${query}%`
			});
		}

		qb.orderBy('space.created', 'DESC');

		return qb.getMany();
	}
}
