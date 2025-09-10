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

import { json } from 'body-parser';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

import { debugLoggingOnly } from './_core/utils/utils.logging';

import compression from 'compression';
import helmet from 'helmet';
import csurf from 'csurf';
import enforce from 'express-sslify';

import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
	const isLocal = process.env.LOCALHOST || false;
	const isDebug = process.env.DEBUG || false;
	const app = await NestFactory.create<NestExpressApplication>(
		AppModule,
		{
			cors: {
				origin: checkCORS.bind(this)
			}
		}
	);

	app.set('query parser', 'extended');

	app.use(compression());

	app.use(json({ limit: '10mb' }));

	app.useGlobalPipes(new ValidationPipe({
		transform: true,
		whitelist: true,
		forbidNonWhitelisted: true
	}));

	// Require SSL
	if(!isLocal) {
		app.use(enforce.HTTPS({ trustProtoHeader: true }));
	}

	// Disable logging.
	if(!isDebug) {
		debugLoggingOnly();
	}

	// Security header middleware
	app.use(helmet());

	// Swagger documentation
	if(process.env.SWAGGER_ENABLE) {
		const config = new DocumentBuilder()
			.setTitle('Your new API')
			.setDescription('API for doing stuff.')
			.setVersion('1.0')
			.addBearerAuth({
					description: `Please enter token in following format: Bearer <JWT>`,
					name: 'Authorization',
					bearerFormat: 'Bearer',
					scheme: 'Bearer',
					type: 'http',
					in: 'Header'
			})
			.build();
		const document = SwaggerModule.createDocument(app, config);
		SwaggerModule.setup('api', app, document);
	}

	await app.listen(process.env.PORT || 8001);
}

// Used for application whitelisting.
function checkCORS(origin: string, cb) {
	const isLocal = process.env.LOCALHOST || false;
	const envOrigins = process.env.ORIGINS?.split(',');

	if(typeof origin === 'undefined') {
		cb(null, false);
		return;
	}

	let matchedOrigin = false;
	if(envOrigins?.length) {
		const trimmed = origin
			.replace(/(http|https):\/\//g, '')
			.replace(/:(.*)/, '')
			.replace(/\/(.*)/, '');

		for(const o of envOrigins) {
			if(o.indexOf('*') === 0) {
				const regString = o
					.replace(/\*\./, '')
					.replace(/\./g, '\\.');
				matchedOrigin = (trimmed.match(new RegExp(`${regString}$`))) ? true : false;
			} else {
				matchedOrigin = (trimmed.match(new RegExp(`${o}$`))) ? true : false;
			}
			if(matchedOrigin) {
				break;
			}
		};
	}

	if(isLocal && origin.includes('localhost')) {
		matchedOrigin = true;
	}

	cb(null, matchedOrigin);
}

bootstrap();
