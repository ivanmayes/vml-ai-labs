import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, FindOptionsWhere, Repository } from 'typeorm';

import { FindOptions } from '../_core/models';

import { Project } from './project.entity';

@Injectable()
export class ProjectService {
	constructor(
		@InjectRepository(Project)
		private readonly projectRepository: Repository<Project>,
	) {}

	public async add(project: Partial<Project>) {
		return this.projectRepository.save(project);
	}

	public async update(project: Project) {
		return this.projectRepository.save(project);
	}

	public async findPaginated(
		options: FindOptions<Project>,
		filter: FindOptionsWhere<Project> = {},
	): Promise<[Project[], number]> {
		const { page, perPage, sortBy, sortOrder } = options;

		const where: FindManyOptions<Project>['where'] = {
			...filter,
		};

		const order: FindManyOptions<Project>['order'] = {};
		if (sortBy) {
			order[sortBy as string] = sortOrder;
		}

		const skip = (page - 1) * perPage;

		return this.projectRepository.findAndCount({
			where,
			order,
			skip,
			take: perPage,
		});
	}
}
