import {
	CallHandler,
	ExecutionContext,
	Injectable,
	NestInterceptor,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';

import { ApiKeyService } from '../api-key.service';
import { Crypt } from '../../_core/crypt';
import { RequestMeta } from '../../_core/models';

/**
 * Used to track API Key usage.
 * Automatically attaches `meta` from the request body to the log.
 * Whitelist new properties in `RequestMeta` if needed.
 *
 */
@Injectable()
export class ApiKeyLogInterceptor implements NestInterceptor {
	private readonly logHeader = ':: API Key Log Interceptor ::';

	constructor(private readonly apiKeyService: ApiKeyService) {}

	public async intercept(context: ExecutionContext, next: CallHandler) {
		const req = context.switchToHttp().getRequest();
		const path = req?.route?.path.toString();
		const token = req.headers.authorization?.split(' ')[1];

		const encrypted = Crypt.encrypt(
			token ?? '',
			Crypt.createSHA256Hash(process.env.PII_SIGNING_KEY ?? ''),
			process.env.PII_SIGNING_OFFSET ?? '',
		);

		if (!encrypted) {
			console.log(this.logHeader, 'No encrypted token.');
			return next.handle();
		}

		const key = await this.apiKeyService
			.findOne({
				where: {
					key: encrypted,
				},
			})
			.catch((err) => {
				console.log(err);
				return null;
			});

		if (!key) {
			console.log(this.logHeader, 'No key found.');
			return next.handle();
		}

		const meta = plainToInstance(RequestMeta, req.body?.meta || {}, {
			excludeExtraneousValues: true,
		});
		await this.apiKeyService
			.addLog(key.id, path ?? '', meta)
			.catch((err) => {
				console.log(this.logHeader, err);
			});

		return next.handle();
	}
}
