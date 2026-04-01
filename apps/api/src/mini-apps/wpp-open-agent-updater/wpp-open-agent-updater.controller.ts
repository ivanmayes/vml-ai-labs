import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Req,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { ResponseEnvelope, ResponseStatus } from '../../_platform/models';
import { RequiresApp, CurrentOrg } from '../../_platform/decorators';

import { UpdaterTaskService } from './services/updater-task.service';
import { BoxService } from './services/box.service';
import { WppOpenAgentService } from './services/wpp-open-agent.service';
import { CreateTaskDto } from './dtos/create-task.dto';
import { UpdateTaskDto } from './dtos/update-task.dto';
import { TriggerRunDto } from './dtos/trigger-run.dto';
import { WppOpenOsContext } from './types/wpp-open.types';

/**
 * Request type with authenticated user
 */
interface AuthenticatedRequest extends Request {
	user: {
		id: string;
		organizationId: string;
		[key: string]: unknown;
	};
}

@RequiresApp('wpp-open-agent-updater')
@Controller('organization/:orgId/apps/wpp-open-agent-updater')
@UseGuards(AuthGuard('jwt'))
export class WppOpenAgentUpdaterController {
	constructor(
		private readonly taskService: UpdaterTaskService,
		private readonly boxService: BoxService,
		private readonly wppOpenAgentService: WppOpenAgentService,
	) {}

	// ── Task CRUD ──────────────────────────────────────────────

	@Post('tasks')
	async createTask(
		@CurrentOrg() orgId: string,
		@Req() req: AuthenticatedRequest,
		@Body() dto: CreateTaskDto,
	) {
		const task = await this.taskService.createTask(dto, req.user.id, orgId);
		return new ResponseEnvelope(ResponseStatus.Success, undefined, task);
	}

	@Get('tasks')
	async listTasks(@CurrentOrg() orgId: string) {
		const tasks = await this.taskService.listTasks(orgId);
		return new ResponseEnvelope(ResponseStatus.Success, undefined, tasks);
	}

	@Get('tasks/:id')
	async getTask(@Param('id') id: string, @CurrentOrg() orgId: string) {
		const task = await this.taskService.getTask(id, orgId);
		return new ResponseEnvelope(ResponseStatus.Success, undefined, task);
	}

	@Put('tasks/:id')
	async updateTask(
		@Param('id') id: string,
		@CurrentOrg() orgId: string,
		@Body() dto: UpdateTaskDto,
	) {
		const task = await this.taskService.updateTask(id, dto, orgId);
		return new ResponseEnvelope(ResponseStatus.Success, undefined, task);
	}

	@Delete('tasks/:id')
	async deleteTask(@Param('id') id: string, @CurrentOrg() orgId: string) {
		await this.taskService.deleteTask(id, orgId);
		return new ResponseEnvelope(ResponseStatus.Success, 'Task archived');
	}

	// ── Run Management ────────────────────────────────────────

	@Post('tasks/:id/run')
	async triggerRun(
		@Param('id') id: string,
		@CurrentOrg() orgId: string,
		@Req() req: AuthenticatedRequest,
		@Body() dto: TriggerRunDto,
	) {
		const run = await this.taskService.triggerRun(
			id,
			req.user.id,
			orgId,
			dto.wppOpenToken,
			dto.osContext,
		);
		return new ResponseEnvelope(ResponseStatus.Success, undefined, run);
	}

	@Get('tasks/:id/runs')
	async listRuns(@Param('id') id: string, @CurrentOrg() orgId: string) {
		const runs = await this.taskService.listRuns(id, orgId);
		return new ResponseEnvelope(ResponseStatus.Success, undefined, runs);
	}

	@Get('runs/:id')
	async getRun(@Param('id') id: string, @CurrentOrg() orgId: string) {
		const run = await this.taskService.getRun(id, orgId);
		return new ResponseEnvelope(ResponseStatus.Success, undefined, run);
	}

	// ── Integration Endpoints ─────────────────────────────────

	@Get('box/validate/:folderId')
	async validateBoxFolder(@Param('folderId') folderId: string) {
		const info = await this.boxService.validateFolder(folderId);
		return new ResponseEnvelope(ResponseStatus.Success, undefined, info);
	}

	@Post('agents/config')
	async getAgentConfig(
		@CurrentOrg() _orgId: string,
		@Body()
		body: {
			projectId: string;
			agentId: string;
			wppOpenToken: string;
			osContext?: WppOpenOsContext;
		},
	) {
		if (!body.wppOpenToken || !body.projectId || !body.agentId) {
			throw new BadRequestException(
				'wppOpenToken, projectId, and agentId are required',
			);
		}

		const config = await this.wppOpenAgentService.getAgentConfig(
			body.wppOpenToken,
			body.projectId,
			body.agentId,
			body.osContext,
		);

		const files = config.files || [];
		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			id: config.id,
			name: config.name,
			fileCount: files.length,
			files: files.map((f) => ({
				fileName: 'fileName' in f ? f.fileName : undefined,
				contentLength: 'content' in f ? f.content?.length || 0 : 0,
				hasPersistent: 'persistentFileLocation' in f,
				hasTemporary: 'temporaryFileLocation' in f,
			})),
			rawKeys: Object.keys(config),
		});
	}

	@Post('agents')
	async listAgents(
		@CurrentOrg() _orgId: string,
		@Body()
		body: {
			projectId?: string;
			wppOpenToken: string;
			osContext?: WppOpenOsContext;
		},
	) {
		if (!body.wppOpenToken) {
			throw new BadRequestException('wppOpenToken is required');
		}

		let projectId = body.projectId;

		// If osContext is provided, resolve the CS internal project ID
		if (body.osContext && !projectId) {
			projectId = await this.wppOpenAgentService.resolveProjectId(
				body.wppOpenToken,
				body.osContext,
			);
		}

		if (!projectId) {
			throw new BadRequestException(
				'Either projectId or osContext is required to list agents',
			);
		}

		const agents = await this.wppOpenAgentService.listAgents(
			body.wppOpenToken,
			projectId,
			body.osContext,
		);
		return new ResponseEnvelope(ResponseStatus.Success, undefined, {
			agents,
			resolvedProjectId: projectId,
		});
	}
}
