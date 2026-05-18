/**
 * Text Counter Template Controller
 *
 * Org-scoped CRUD for the reusable labelled-field templates used by
 * the text-counter image-extraction "template" mode. All routes are
 * gated by JWT, and the global `HasAppAccessGuard` resolves
 * `@RequiresApp('text-counter')` against `organization_apps`.
 */
import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Req,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { CurrentOrg, RequiresApp } from '../../_platform/decorators';
import { ResponseEnvelope, ResponseStatus } from '../../_platform/models';

import { CreateTemplateDto, UpdateTemplateDto } from './dtos';
import { TemplateService } from './services/template.service';

interface AuthenticatedRequest extends Request {
	user: { id: string; organizationId: string };
}

@RequiresApp('text-counter')
@UseGuards(AuthGuard('jwt'))
@Controller('organization/:orgId/apps/text-counter/templates')
export class TemplateController {
	constructor(private readonly templateService: TemplateService) {}

	@Get()
	async list(@CurrentOrg() orgId: string): Promise<ResponseEnvelope> {
		const templates = await this.templateService.findAll(orgId);
		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			templates,
		);
	}

	@Get(':id')
	async get(
		@CurrentOrg() orgId: string,
		@Param('id', new ParseUUIDPipe()) id: string,
	): Promise<ResponseEnvelope> {
		const template = await this.templateService.findOne(id, orgId);
		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			template,
		);
	}

	@Post()
	@HttpCode(HttpStatus.CREATED)
	async create(
		@Req() req: AuthenticatedRequest,
		@CurrentOrg() orgId: string,
		@Body() dto: CreateTemplateDto,
	): Promise<ResponseEnvelope> {
		const created = await this.templateService.create({
			dto,
			orgId,
			userId: req.user.id,
		});
		return new ResponseEnvelope(ResponseStatus.Success, undefined, created);
	}

	@Put(':id')
	async update(
		@CurrentOrg() orgId: string,
		@Param('id', new ParseUUIDPipe()) id: string,
		@Body() dto: UpdateTemplateDto,
	): Promise<ResponseEnvelope> {
		const updated = await this.templateService.update({
			id,
			dto,
			orgId,
		});
		return new ResponseEnvelope(ResponseStatus.Success, undefined, updated);
	}

	@Delete(':id')
	async delete(
		@CurrentOrg() orgId: string,
		@Param('id', new ParseUUIDPipe()) id: string,
	): Promise<ResponseEnvelope> {
		await this.templateService.delete(id, orgId);
		return new ResponseEnvelope(ResponseStatus.Success);
	}
}
