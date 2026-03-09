import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FindOptions } from '../../_platform/models';

import { UpdaterTask } from './entities/updater-task.entity';
import { TaskRun } from './entities/task-run.entity';
import { TaskRunFile } from './entities/task-run-file.entity';

@Injectable()
export class WppOpenAgentUpdaterService {
	private readonly logger = new Logger(WppOpenAgentUpdaterService.name);

	constructor(
		@InjectRepository(UpdaterTask)
		private readonly taskRepo: Repository<UpdaterTask>,
		@InjectRepository(TaskRun)
		readonly runRepo: Repository<TaskRun>,
		@InjectRepository(TaskRunFile)
		readonly runFileRepo: Repository<TaskRunFile>,
	) {
		this.logger.log('WppOpenAgentUpdaterService initialized');
	}

	public async add(data: Record<string, any>) {
		const task = this.taskRepo.create(data);
		return this.taskRepo.save(task);
	}

	public async update(data: Record<string, any>) {
		return data;
	}

	public async findPaginated(
		options: FindOptions<any>,
		filter: Record<string, any> = {},
	): Promise<[any[], number]> {
		const { page = 1, perPage = 10, sortBy, sortOrder } = options;

		return this.taskRepo.findAndCount({
			where: { organizationId: filter.organizationId },
			skip: (page - 1) * perPage,
			take: perPage,
			order: sortBy
				? { [sortBy]: sortOrder || 'ASC' }
				: { createdAt: 'DESC' },
		});
	}
}
