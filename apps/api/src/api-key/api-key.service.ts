import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, FindOneOptions, Repository } from 'typeorm';

import { ApiKey } from './api-key.entity';
import { RequestEnvelope } from '../_core/models';
import { ApiKeyLog } from './api-key-log.entity';

@Injectable()
export class ApiKeyService {
	private readonly debug = process.env.DEBUG || false;

	constructor(
		@InjectRepository(ApiKey)
		private readonly apiKeyRepository: Repository<ApiKey>,
		@InjectRepository(ApiKeyLog)
		private readonly apiKeyLogRepository: Repository<ApiKeyLog>
	) {}
	
	public async find(options: FindManyOptions<ApiKey>) {
		return this.apiKeyRepository
			.find(options);
	}

	public async findOne(options: FindOneOptions<ApiKey>) {
		return this.apiKeyRepository
			.findOne(options);
	}

	public async addOne(key: Partial<ApiKey>) {
		return this.apiKeyRepository
			.save(key);
	}

	public async addLog(id: string, endpoint: string, meta: RequestEnvelope['meta'] = {}) {
		return this.apiKeyLogRepository
			.save(new ApiKeyLog({
				apiKeyId: id,
				endpoint,
				meta
			}));
	}
}
