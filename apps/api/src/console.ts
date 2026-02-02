// Handle environment file
import fs from 'fs';

import dotenv from 'dotenv';
if(fs.existsSync('.env')) {
	dotenv.config();
} else {
	if(process.env.PRIVATE_KEY) {
		process.env.PRIVATE_KEY = process.env.PRIVATE_KEY.replace(/\\n/gm, '\n').replace(/"/gm, '');
	}

	if(process.env.PUBLIC_KEY) {
		process.env.PUBLIC_KEY = process.env.PUBLIC_KEY.replace(/\\n/gm, '\n').replace(/"/gm, '');
	}
}

delete process.env.DATABASE_SYNCHRONIZE;

import { BootstrapConsole } from 'nestjs-console';

import { AppModule } from './app.module';

const bootstrap = new BootstrapConsole({
	module: AppModule,
	useDecorators: true
});
bootstrap.init().then(async (app) => {
	try {
		await app.init();
		// boot the cli
		await bootstrap.boot();

		// Use app.close() instead of process.exit() because app.close() will
		// trigger onModuleDestroy, beforeApplicationShutdown and onApplicationShutdown.
		// For example, in your command doing the database operation and need to close
		// when error or finish.
		await app.close();

		process.exit(0);
	} catch (e) {
		console.log(e);
		app.close();

		process.exit(1);
	}
});