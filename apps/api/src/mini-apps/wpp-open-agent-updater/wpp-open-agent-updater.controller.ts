import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Put,
	Query,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { ResponseEnvelope, ResponseStatus } from '../../_platform/models';
import {
	RequiresApp,
	CurrentOrg,
	CurrentUser,
} from '../../_platform/decorators';

import { UpdaterTaskService } from './services/updater-task.service';
import { BoxService } from './services/box.service';
import { WppOpenAgentService } from './services/wpp-open-agent.service';
import { CreateTaskDto } from './dtos/create-task.dto';
import { UpdateTaskDto } from './dtos/update-task.dto';
import { TriggerRunDto } from './dtos/trigger-run.dto';

@RequiresApp('wpp-open-agent-updater')
@Controller('apps/wpp-open-agent-updater')
@UseGuards(AuthGuard())
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
		@CurrentUser() userId: string,
		@Body() dto: CreateTaskDto,
	) {
		const task = await this.taskService.createTask(dto, userId, orgId);
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
		@CurrentUser() userId: string,
		@Body() dto: TriggerRunDto,
	) {
		const run = await this.taskService.triggerRun(
			id,
			userId,
			orgId,
			dto.wppOpenToken,
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

	@Get('agents')
	async listAgents(
		@Query('projectId') projectId: string,
		@Query('token') token: string,
	) {
		const agents = await this.wppOpenAgentService.listAgents(
			token,
			projectId,
		);
		return new ResponseEnvelope(ResponseStatus.Success, undefined, agents);
	}
}
