import { ThrottlerGuard } from '@nestjs/throttler';
import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { String } from '../utils/utils.string';

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
	protected async getTracker(req: Request): Promise<string> {
		return String.cleanIPAddress(req.headers['x-forwarded-for'] as string || req.socket.remoteAddress);
	}
}