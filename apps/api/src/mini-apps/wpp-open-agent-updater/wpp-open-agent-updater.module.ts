import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WppOpenAgentUpdaterController } from './wpp-open-agent-updater.controller';
import { WppOpenAgentUpdaterService } from './wpp-open-agent-updater.service';
import { UpdaterTaskService } from './services/updater-task.service';
import { BoxService } from './services/box.service';
import { WppOpenAgentService } from './services/wpp-open-agent.service';
import { RunWorkerService } from './services/run-worker.service';
import { UpdaterTask } from './entities/updater-task.entity';
import { TaskRun } from './entities/task-run.entity';
import { TaskRunFile } from './entities/task-run-file.entity';
// MINIAPP_ENTITY_IMPORT

@Module({
	imports: [
		TypeOrmModule.forFeature([
			UpdaterTask,
			TaskRun,
			TaskRunFile,
			// MINIAPP_ENTITY_REF
		]),
	],
	controllers: [WppOpenAgentUpdaterController],
	providers: [
		WppOpenAgentUpdaterService,
		UpdaterTaskService,
		BoxService,
		WppOpenAgentService,
		RunWorkerService,
	],
	exports: [WppOpenAgentUpdaterService],
})
export class WppOpenAgentUpdaterModule {}
