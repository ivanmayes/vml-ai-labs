/**
 * Generate OpenAPI specification from NestJS Swagger configuration.
 *
 * This script bootstraps the NestJS application, generates the OpenAPI document,
 * and writes it to api-manifest.json at the repository root for AI agent access.
 *
 * Usage: npx ts-node -r tsconfig-paths/register scripts/generate-openapi.ts
 */
import * as fs from 'fs';
import * as path from 'path';

// Set environment variables before importing the app module
process.env.SWAGGER_ENABLE = 'true';

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

async function generate(): Promise<void> {
	// Create app instance with minimal logging
	const app = await NestFactory.create(AppModule, {
		logger: ['error'],
	});

	const config = new DocumentBuilder()
		.setTitle('VML API')
		.setDescription(
			'API manifest for AI agent coordination. Contains all endpoints, DTOs, and response types.',
		)
		.setVersion('1.0')
		.addBearerAuth({
			description: 'JWT Bearer token',
			name: 'Authorization',
			bearerFormat: 'Bearer',
			scheme: 'Bearer',
			type: 'http',
			in: 'Header',
		})
		.build();

	const document = SwaggerModule.createDocument(app, config);

	// Write to root for easy AI agent access
	const outputPath = path.join(
		__dirname,
		'..',
		'..',
		'..',
		'api-manifest.json',
	);
	fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));

	console.log(`API manifest written to: ${outputPath}`);
	console.log(
		`  - Paths: ${Object.keys(document.paths || {}).length} endpoints`,
	);
	console.log(
		`  - Schemas: ${Object.keys(document.components?.schemas || {}).length} DTOs/types`,
	);

	await app.close();
}

generate().catch((error) => {
	console.error('Failed to generate API manifest:', error);
	process.exit(1);
});
