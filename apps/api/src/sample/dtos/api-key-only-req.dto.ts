import { IntersectionType } from '@nestjs/swagger';
import { IsString } from 'class-validator';

import { RequestEnvelope } from '../../_core/models';

class APIKeySampleParams {
	@IsString()
	message: string
}

// Combines the types in a way that will work with the
// automatic swagger documentation.
export class ApiKeyOnlyReq extends IntersectionType(
	RequestEnvelope,
	APIKeySampleParams
) {}