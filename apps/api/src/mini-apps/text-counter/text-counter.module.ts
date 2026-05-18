import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Template } from './entities/template.entity';
import { TemplateField } from './entities/template-field.entity';
import { TemplateController } from './template.controller';
import { TemplateService } from './services/template.service';

/**
 * Text Counter mini app — module wiring.
 *
 * U2 introduces org-scoped template CRUD. The text-counter mini app
 * is no longer client-only as of this unit; the `text_counter` schema
 * is created by migration `1747958400000-CreateTextCounterSchema.ts`
 * (U1) and the `template` + `template_field` tables back the persisted
 * state. Counting and rule evaluation remain client-side; the server
 * persists only the reusable templates.
 *
 * No CommonModule import: this mini app does not consume the per-space
 * membership infra (templates are org-scoped, not space-scoped).
 */
@Module({
	imports: [TypeOrmModule.forFeature([Template, TemplateField])],
	controllers: [TemplateController],
	providers: [TemplateService],
	exports: [TemplateService],
})
export class TextCounterModule {}
