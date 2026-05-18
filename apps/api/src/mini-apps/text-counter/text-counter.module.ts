import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Template } from './entities/template.entity';
import { TemplateField } from './entities/template-field.entity';
import { ExtractionController } from './extraction.controller';
import { ExtractionService } from './services/extraction.service';
import { TemplateController } from './template.controller';
import { TemplateService } from './services/template.service';

/**
 * Text Counter mini app — module wiring.
 *
 * U2 introduced org-scoped template CRUD; U3 adds the vision-based
 * extraction endpoint. The `text_counter` schema is created by
 * migration `1747958400000-CreateTextCounterSchema.ts` (U1) and the
 * `template` + `template_field` tables back the persisted template
 * state. Counting and rule evaluation remain client-side; the server
 * persists only the reusable templates — extracted text and uploaded
 * images are never written to disk or to the DB.
 *
 * No CommonModule import: this mini app does not consume the per-space
 * membership infra (templates are org-scoped, not space-scoped).
 *
 * `AIService` is provided globally by `@Global() AIModule` and
 * `ImageFileValidationService` is provided globally by
 * `@Global() PlatformModule`, so neither needs an explicit `imports`
 * entry here.
 */
@Module({
	imports: [TypeOrmModule.forFeature([Template, TemplateField])],
	controllers: [TemplateController, ExtractionController],
	providers: [TemplateService, ExtractionService],
	exports: [TemplateService],
})
export class TextCounterModule {}
