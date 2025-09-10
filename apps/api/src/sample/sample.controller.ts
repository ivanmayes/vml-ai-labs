import {
	Body,
	Controller,
	DefaultValuePipe,
	Delete,
	Get,
	HttpException,
	HttpStatus,
	Post,
	Put,
	Query,
	UseGuards,
	UseInterceptors
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiKeyLogInterceptor } from '../api-key/interceptors/api-key-log.interceptor';
import { ResponseEnvelope, ResponseEnvelopeFind, ResponseStatus } from '../_core/models';
import { Strapi, Utils as StrapiUtils } from '../_core/third-party/strapi';
import { ApiKeyOnlyReq } from './dtos/api-key-only-req.dto';

@Controller('sample')
export class SampleController {
	constructor(
		
	) {}

	// An example endpoint that requires an API key
	// It also has a simple interceptor that can be used to
	// log requests for tracking purposes.
	// The DTO is merged with a "RequestMeta" object that stores some basic values
	// that could be used for tracking/reporting.
	// Should be customized if needed.
	@Post('api-key-only')
	@UseGuards(AuthGuard('bearer'))
	@UseInterceptors(ApiKeyLogInterceptor)
	public async writeAPIKey(
		@Body() apiKeyOnlyReq: ApiKeyOnlyReq
	) {
		return new ResponseEnvelope(ResponseStatus.Success, 'WriteAPIKey');
	}

	@Post()
	@UseGuards(AuthGuard())
	public async create() {
		return new ResponseEnvelope(ResponseStatus.Success, 'Create');
	}

	@Get()
	@UseGuards(AuthGuard())
	public async find(
		@Query('page', new DefaultValuePipe(1)) page: number,
		@Query('perPage', new DefaultValuePipe(10)) perPage: number
	) {
		const cmsResponse = await Strapi.queryCollection('samples', page, perPage)
			.catch((err) => {
				console.log(err);
				return null;
			});

		if(!cmsResponse) {
			throw new HttpException(
				new ResponseEnvelope(ResponseStatus.Error, 'Failed to query collection'),
				HttpStatus.INTERNAL_SERVER_ERROR
			);
		}

		return new ResponseEnvelopeFind(
			ResponseStatus.Success,
			undefined,
			StrapiUtils.collectionResponseToFindResponse(cmsResponse)
		);
	}

	@Get(':id')
	@UseGuards(AuthGuard())
	public async read() {
		return new ResponseEnvelope(ResponseStatus.Success, 'Read');
	}

	@Put(':id')
	@UseGuards(AuthGuard())
	public async update() {
		return new ResponseEnvelope(ResponseStatus.Success, 'Update');
	}

	@Delete(':id')
	@UseGuards(AuthGuard())
	public async delete() {
		return new ResponseEnvelope(ResponseStatus.Success, 'Delete');
	}
}
