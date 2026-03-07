import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';

import { OrganizationApp } from './organization-app.entity';

@Injectable()
export class OrganizationAppService {
	constructor(
		@InjectRepository(OrganizationApp)
		private readonly organizationAppRepository: Repository<OrganizationApp>,
	) {}

	public async isAppEnabled(orgId: string, appKey: string): Promise<boolean> {
		const record = await this.organizationAppRepository.findOne({
			where: { organizationId: orgId, appKey },
		});

		return !!record?.enabled;
	}

	public async enableApp(
		orgId: string,
		appKey: string,
	): Promise<OrganizationApp> {
		let record = await this.organizationAppRepository.findOne({
			where: { organizationId: orgId, appKey },
		});

		if (record) {
			record.enabled = true;
			return this.organizationAppRepository.save(record);
		}

		record = new OrganizationApp({
			organizationId: orgId,
			appKey,
			enabled: true,
		});

		return this.organizationAppRepository.save(record);
	}

	public async disableApp(
		orgId: string,
		appKey: string,
	): Promise<OrganizationApp> {
		let record = await this.organizationAppRepository.findOne({
			where: { organizationId: orgId, appKey },
		});

		if (record) {
			record.enabled = false;
			return this.organizationAppRepository.save(record);
		}

		record = new OrganizationApp({
			organizationId: orgId,
			appKey,
			enabled: false,
		});

		return this.organizationAppRepository.save(record);
	}

	public async getEnabledApps(orgId: string): Promise<OrganizationApp[]> {
		return this.organizationAppRepository.find({
			where: { organizationId: orgId, enabled: true },
		});
	}

	public async findPaginated(
		options?: FindManyOptions<OrganizationApp>,
		filter?: { organizationId?: string },
	) {
		const where: any = {};

		if (filter?.organizationId) {
			where.organizationId = filter.organizationId;
		}

		const findOptions: FindManyOptions<OrganizationApp> = {
			...options,
			where: {
				...where,
				...(options?.where || {}),
			},
		};

		const [results, total] =
			await this.organizationAppRepository.findAndCount(findOptions);

		return {
			results,
			total,
			page: findOptions.skip
				? Math.floor(findOptions.skip / (findOptions.take || 10)) + 1
				: 1,
			limit: findOptions.take || total,
		};
	}
}
