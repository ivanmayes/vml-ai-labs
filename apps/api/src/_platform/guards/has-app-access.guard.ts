import {
	CanActivate,
	ExecutionContext,
	ForbiddenException,
	Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { DataSource } from 'typeorm';

import { REQUIRES_APP_KEY } from '../decorators/requires-app.decorator';

@Injectable()
export class HasAppAccessGuard implements CanActivate {
	private readonly cache = new Map<
		string,
		{ result: boolean; expiry: number }
	>();
	private readonly cacheTtlMs = 60_000;
	private readonly jwtGuard = new (AuthGuard())();

	constructor(
		private readonly reflector: Reflector,
		private readonly dataSource: DataSource,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const appKey = this.reflector.getAllAndOverride<string>(
			REQUIRES_APP_KEY,
			[context.getHandler(), context.getClass()],
		);

		if (!appKey) {
			return true;
		}

		// Ensure the user is authenticated before checking app access.
		// This guard runs as a global APP_GUARD before controller-level
		// AuthGuard(), so request.user won't be set yet.
		const request = context.switchToHttp().getRequest();
		if (!request.user) {
			try {
				await this.jwtGuard.canActivate(context);
			} catch {
				// Auth failed — let the controller's own AuthGuard handle it
				return true;
			}
		}

		const organizationId = request.user?.organizationId;

		if (!organizationId) {
			throw new ForbiddenException('Organization context required');
		}

		const cacheKey = `${organizationId}:${appKey}`;
		const cached = this.cache.get(cacheKey);
		if (cached && cached.expiry > Date.now()) {
			if (!cached.result) {
				throw new ForbiddenException(
					`App "${appKey}" is not enabled for this organization`,
				);
			}
			return true;
		}

		const result = await this.dataSource.query(
			`SELECT enabled FROM organization_apps WHERE "organizationId" = $1 AND "appKey" = $2`,
			[organizationId, appKey],
		);

		const isEnabled = result.length > 0 && result[0].enabled === true;

		this.cache.set(cacheKey, {
			result: isEnabled,
			expiry: Date.now() + this.cacheTtlMs,
		});

		if (!isEnabled) {
			throw new ForbiddenException(
				`App "${appKey}" is not enabled for this organization`,
			);
		}

		return true;
	}
}
