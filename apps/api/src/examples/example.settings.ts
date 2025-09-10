import { IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { EntityCustomization } from '../_core/models/entity-customization';

export class ExampleSettings extends EntityCustomization {
	@IsOptional()
	@ValidateNested()
	@Type(() => EntityCustomization)
	description?: EntityCustomization = new EntityCustomization();
}
