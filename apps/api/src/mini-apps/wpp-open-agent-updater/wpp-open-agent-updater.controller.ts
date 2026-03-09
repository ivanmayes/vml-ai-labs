import {
	Body,
	Controller,
	DefaultValuePipe,
	Delete,
	Get,
	HttpException,
	HttpStatus,
	Param,
	Post,
	Put,
	Query,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import {
	ResponseEnvelope,
	ResponseEnvelopeFind,
	ResponseStatus,
	SortStrategy,
	FindOptions,
} from '../../_platform/models';
import { RequiresApp, CurrentOrg } from '../../_platform/decorators';

import { WppOpenAgentUpdaterService } from './wpp-open-agent-updater.service';

@RequiresApp('wpp-open-agent-updater')
@Controller('apps/wpp-open-agent-updater')
export class WppOpenAgentUpdaterController {
	constructor(
		private readonly wppOpenAgentUpdaterService: WppOpenAgentUpdaterService,
	) {}

	@Post()
	@UseGuards(AuthGuard())
	public async create(@CurrentOrg() orgId: string, @Body() body: any) {
		const result = await this.wppOpenAgentUpdaterService.add({
			...body,
			organizationId: orgId,
		});
		return new ResponseEnvelope(ResponseStatus.Success, undefined, result);
	}

	@Get(':id')
	@UseGuards(AuthGuard())
	public async read(@Param('id') _id: string) {
		return new ResponseEnvelope(ResponseStatus.Success, 'Read');
	}

	@Put(':id')
	@UseGuards(AuthGuard())
	public async update(@Param('id') _id: string, @Body() _body: any) {
		return new ResponseEnvelope(ResponseStatus.Success, 'Update');
	}

	@Delete(':id')
	@UseGuards(AuthGuard())
	public async delete(@Param('id') _id: string) {
		return new ResponseEnvelope(ResponseStatus.Success, 'Delete');
	}

	@Post('find')
	@UseGuards(AuthGuard())
	public async find(
		@CurrentOrg() orgId: string,
		@Body() filter: any,
		@Query('page', new DefaultValuePipe(1)) page: number,
		@Query('perPage', new DefaultValuePipe(10)) perPage: number,
		@Query('sortBy') sortBy?: string,
		@Query('order', new DefaultValuePipe('ASC')) sortOrder?: SortStrategy,
	) {
		perPage = perPage > 50 ? 50 : perPage;
		const options: FindOptions<any> = {
			page,
			perPage,
			sortBy,
			sortOrder,
		};

		const [queryResult, count] = await this.wppOpenAgentUpdaterService
			.findPaginated(options, { ...filter, organizationId: orgId })
			.catch((err) => {
				console.error(err);
				throw new HttpException(
					new ResponseEnvelope(
						ResponseStatus.Error,
						'Error finding records.',
					),
					HttpStatus.INTERNAL_SERVER_ERROR,
				);
			});

		return new ResponseEnvelopeFind(ResponseStatus.Success, undefined, {
			page,
			perPage,
			numPages: Math.ceil(count / perPage) || 1,
			totalResults: count,
			results: queryResult,
		});
	}
}
