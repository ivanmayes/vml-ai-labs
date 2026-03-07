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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import {
	ResponseEnvelope,
	ResponseEnvelopeFind,
	ResponseStatus,
	SortStrategy,
	FindOptions,
} from '../_core/models';

import { ProjectService } from './project.service';
import { Project } from './project.entity';
import { ProjectFindDto } from './dtos';

@Controller('project')
export class ProjectController {
	constructor(private readonly projectService: ProjectService) {}

	@Post()
	@UseGuards(AuthGuard())
	public async create() {
		return new ResponseEnvelope(ResponseStatus.Success, 'Create');
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

	@Post('find')
	@UseGuards(AuthGuard())
	public async find(
		@Body() filter: ProjectFindDto,
		@Query('page', new DefaultValuePipe(1)) page: number,
		@Query('perPage', new DefaultValuePipe(10)) perPage: number,
		@Query('sortBy') sortBy?: keyof Project,
		@Query('order', new DefaultValuePipe('ASC')) sortOrder?: SortStrategy,
	) {
		perPage = perPage > 50 ? 50 : perPage;
		const options: FindOptions<Project> = {
			page,
			perPage,
			sortBy,
			sortOrder,
		};

		let error;
		const [queryResult, count]: [Project[], number] =
			await this.projectService
				.findPaginated(options, filter)
				.catch((err) => {
					console.log(err);
					error = err;
					return [[], 0];
				});

		if (error) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Error,
					'Error finding Projects.',
				),
				HttpStatus.INTERNAL_SERVER_ERROR,
			);
		}

		return new ResponseEnvelopeFind<Project>(
			ResponseStatus.Success,
			undefined,
			{
				page,
				perPage,
				numPages: Math.ceil(count / perPage) || 1,
				totalResults: count,
				results: queryResult.map((r) => new Project(r).toPublic()),
			},
		);
	}
}
