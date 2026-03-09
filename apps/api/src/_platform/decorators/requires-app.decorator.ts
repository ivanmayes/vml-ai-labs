import { SetMetadata } from '@nestjs/common';

export const REQUIRES_APP_KEY = 'requires_app';
export const RequiresApp = (appKey: string) =>
	SetMetadata(REQUIRES_APP_KEY, appKey);
