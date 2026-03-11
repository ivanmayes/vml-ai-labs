import {
	Body,
	Controller,
	DefaultValuePipe,
	Delete,
	Get,
	HttpException,
	HttpStatus,
	Param,
	ParseUUIDPipe,
	Post,
	Put,
	Query,
	Req,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FindOptionsWhere } from 'typeorm';

import {
	ResponseEnvelope,
	ResponseEnvelopeFind,
	ResponseStatus,
	SortStrategy,
	FindOptions,
} from '../_core/models';
import { User } from '../user/user.entity';

import { ProjectService } from './project.service';
import { Project } from './project.entity';
import { ProjectFindDto, ProjectCreateDto, ProjectUpdateDto } from './dtos';

@Controller('project')
export class ProjectController {
	constructor(private readonly projectService: ProjectService) {}

	@Post()
	@UseGuards(AuthGuard())
	public async create(
		@Req() req: Request & { user: User },
		@Body() body: ProjectCreateDto,
	) {
		if (!req.user.organizationId) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Error,
					'User has no organization.',
				),
				HttpStatus.FORBIDDEN,
			);
		}

		const project = await this.projectService.add({
			name: body.name,
			description: body.description || '',
			spaceId: body.spaceId,
			organizationId: req.user.organizationId,
			createdById: req.user.id ?? undefined,
		});
		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new Project(project).toPublic(),
		);
	}

	@Post('find')
	@UseGuards(AuthGuard())
	public async find(
		@Req() req: Request & { user: User },
		@Body() filter: ProjectFindDto,
		@Query('page', new DefaultValuePipe(1)) page: number,
		@Query('perPage', new DefaultValuePipe(10)) perPage: number,
		@Query('sortBy') sortBy?: keyof Project,
		@Query('order', new DefaultValuePipe('ASC')) sortOrder?: SortStrategy,
	) {
		if (!req.user.organizationId) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Error,
					'User has no organization.',
				),
				HttpStatus.FORBIDDEN,
			);
		}

		// Enforce org scoping: always filter by the current user's organization
		filter.organizationId = req.user.organizationId;

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
				.findPaginated(options, filter as FindOptionsWhere<Project>)
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

	@Get(':id')
	@UseGuards(AuthGuard())
	public async read(
		@Req() req: Request & { user: User },
		@Param('id', new ParseUUIDPipe()) id: string,
	) {
		const project = await this.projectService.findById(id);
		if (!project || project.organizationId !== req.user.organizationId) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Error,
					'Project not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}
		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new Project(project).toPublic(),
		);
	}

	@Put(':id')
	@UseGuards(AuthGuard())
	public async update(
		@Req() req: Request & { user: User },
		@Param('id', new ParseUUIDPipe()) id: string,
		@Body() body: ProjectUpdateDto,
	) {
		const project = await this.projectService.findById(id);
		if (!project || project.organizationId !== req.user.organizationId) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Error,
					'Project not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		if (body.name !== undefined) project.name = body.name;
		if (body.description !== undefined)
			project.description = body.description;

		const updated = await this.projectService.update(project);
		return new ResponseEnvelope(
			ResponseStatus.Success,
			undefined,
			new Project(updated).toPublic(),
		);
	}

	@Delete(':id')
	@UseGuards(AuthGuard())
	public async delete(
		@Req() req: Request & { user: User },
		@Param('id', new ParseUUIDPipe()) id: string,
	) {
		const project = await this.projectService.findById(id);
		if (!project || project.organizationId !== req.user.organizationId) {
			throw new HttpException(
				new ResponseEnvelope(
					ResponseStatus.Error,
					'Project not found.',
				),
				HttpStatus.NOT_FOUND,
			);
		}

		await this.projectService.remove(id);
		return new ResponseEnvelope(ResponseStatus.Success, 'Project deleted.');
	}
}
