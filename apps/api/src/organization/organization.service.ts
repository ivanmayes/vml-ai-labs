import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
	Repository,
	FindManyOptions,
	FindOneOptions,
	DataSource,
} from 'typeorm';

import { Organization } from './organization.entity';

export enum RemoteStatus {
	Invited = 'invited',
	NotInvited = 'not-invited',
	Deactivated = 'deactivated',
	Error = 'error',
}

import { Utils } from './organization.utils';
import { QueryOptions } from './utils/query.utils';

export interface findAllOptions {
	query: string;
	page: number;
	take: number;
}
@Injectable()
export class OrganizationService {
	constructor(
		@InjectRepository(Organization)
		private readonly organizationRepository: Repository<Organization>,
		private readonly dataSource: DataSource,
	) {}

	public async save(organization: Partial<Organization>) {
		return this.organizationRepository.save(organization);
	}

	public async find(options?: FindManyOptions<Organization>) {
		return this.organizationRepository.find(options);
	}

	public async findOne(options: FindOneOptions<Organization>) {
		return this.organizationRepository.findOne(options);
	}

	public async updateOne(org: Partial<Organization>) {
		return this.organizationRepository.save(org);
	}

	public async getOrganization(id: string, enabledOnly: boolean = false) {
		const query: any = {
			where: {
				id,
			},
		};

		if (enabledOnly) {
			query.where.enabled = true;
		}

		return this.organizationRepository.findOne(query);
	}

	public async getOrganizationRaw(
		id: string,
		enabledOnly: boolean = false,
		options?: QueryOptions,
	) {
		const conn = this.dataSource;
		const alias = 'o';
		const subQueries = Utils.Query.getSubqueries(alias, undefined, options);
		const query = `
			SELECT
				${Utils.Query.getSelects(alias)}
			FROM
				organizations AS o${subQueries?.length ? ',' : ''}
				${subQueries}
			WHERE
				${alias}.id = :id
				${enabledOnly ? `AND ${alias}.enabled = true` : ''}
		`;
		const params: any = {
			id,
		};

		// console.log(conn.driver.escapeQueryWithParameters(query, params, {})[0])

		let error;
		const r = await conn
			.query(...conn.driver.escapeQueryWithParameters(query, params, {}))
			.catch((err) => {
				console.log(err);
				error = err;
				return null;
			});

		if (!r?.length) {
			if (error) {
				throw error;
			}
			throw new Error('Organization not found.');
		}

		return new Organization(r[0]);
	}
}
