import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, FindOneOptions, InsertResult, Repository } from 'typeorm';

import {
	AuthenticationStrategy,
	OktaConfig,
	BasicConfig,
	AuthenticationStrategyType
} from './authentication-strategy.entity';
@Injectable()
export class AuthenticationStrategyService {
	constructor(
		@InjectRepository(AuthenticationStrategy)
		private readonly authenticationStrategyRepositiory: Repository<AuthenticationStrategy>
	) {}

	public async save(strategy: Partial<AuthenticationStrategy>) {
		return this.authenticationStrategyRepositiory.save(strategy);
	}

	public async find(options?: FindManyOptions<AuthenticationStrategy>) {
		return this.authenticationStrategyRepositiory.find(options);
	}

	public async findOne(options: FindOneOptions<AuthenticationStrategy>) {
		return this.authenticationStrategyRepositiory.findOne(options);
	}

	public async upsert(strategies: Partial<AuthenticationStrategy>[]) {
		let error;
		const result: InsertResult = await this.authenticationStrategyRepositiory
			.createQueryBuilder()
			.insert()
			.values(strategies)
			.returning(['id', 'remoteId', 'organizationId', 'type', 'name', 'config'])
			.orUpdate({
				conflict_target: ['remoteId', 'organizationId'],
				overwrite: ['name', 'config']
			})
			.execute()
			.catch(err => {
				console.log(err);
				error = err;
				return null;
			});

		if(!result?.generatedMaps?.length || error) {
			if(error) {
				throw error;
			} else {
				throw new Error('Error updating authentication strategies.');
			}
		}

		return result.generatedMaps as AuthenticationStrategy[];
	}
}
