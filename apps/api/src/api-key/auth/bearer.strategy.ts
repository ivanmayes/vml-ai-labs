import { Strategy } from 'passport-http-bearer';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Any, IsNull, MoreThan, Not } from 'typeorm';
import { Request } from 'express';

import { ApiKeyService } from '../api-key.service';
import { Crypt } from '../../_core/crypt';
import type { ApiKey } from '../api-key.entity';

@Injectable()
export class BearerStrategy extends PassportStrategy(Strategy) {
	constructor(private readonly apiKeyService: ApiKeyService) {
		super({ passReqToCallback: true });
	}

	async validate(req: Request, token: string): Promise<any> {
		const keys: string[] = [];
		// Keys that are globally scoped.
		const keyEncryptedMaster = Crypt.encrypt(
			token,
			Crypt.createSHA256Hash(process.env.PII_SIGNING_KEY ?? ''),
			process.env.PII_SIGNING_OFFSET ?? '',
		);
		keys.push(keyEncryptedMaster);

		const keyResult: ApiKey[] | null = await this.apiKeyService
			.find({
				where: [
					{
						key: Any(keys),
						expires: IsNull(),
						revoked: Not(true),
					},
					{
						key: Any(keys),
						expires: MoreThan('NOW()'),
						revoked: Not(true),
					},
				],
			})
			.catch((err) => {
				console.log(err);
				return null;
			});

		if (!keyResult?.length) {
			throw new UnauthorizedException();
		}

		(req as Request & { apiKeyScopes: { organizationIds: string[] } })[
			'apiKeyScopes'
		] = {
			organizationIds: keyResult?.map((k) => k.organizationId) ?? [],
		};

		return true;
	}
}
