import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class TriggerRunDto {
	@IsNotEmpty()
	@IsString()
	wppOpenToken: string;

	@IsOptional()
	@IsObject()
	osContext?: {
		hierarchy?: { azId?: string; mapping?: Record<string, unknown> };
		project?: { azId?: string; id?: string; name?: string };
		tenant?: { azId?: string; id?: string; name?: string };
	};
}
