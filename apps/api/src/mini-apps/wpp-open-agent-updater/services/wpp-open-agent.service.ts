import { randomUUID } from 'crypto';

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';

import {
	WppOpenAgent,
	WppOpenAgentConfig,
	WppOpenKnowledgeItem,
	WppOpenOsContext,
	CSFileUploadItem,
	CSFileItem,
	TransferUploadConfig,
} from '../types/wpp-open.types';

/** Creative Studio API base */
const CS_API_BASE = 'https://creative.wpp.ai';

/** Required CloudFront headers for proper routing */
const CF_HEADERS = {
	Origin: 'https://open-web-cs.wpp.ai',
	Referer: 'https://open-web-cs.wpp.ai/',
};

/**
 * CS error code returned when the requesting user does not have access to the
 * external (OPEN_PROJECT) project being queried. Distinct from a plain auth
 * failure: the token is valid, the project is just not in scope.
 */
export const CS_PERMISSION_ERROR_CODE =
	'ACCESS_LAYER_MISSING_PERMISSIONS_TO_EXTERNAL_PROJECT';

/**
 * CS error code returned when the agent config exists but is owned by a
 * different project than the one the request scoped to. CS's `listAgents`
 * endpoint can return agents under a broader scope than the strict
 * `getAgentConfig` allows, which is how a saved (project, agent) pair on a
 * task can become inconsistent in production.
 */
export const CS_AGENT_MISMATCH_ERROR_CODE =
	'ACCESS_LAYER_AGENT_CONFIG_DOES_NOT_BELONG_TO_PROJECT';

/**
 * Thrown when the CS API rejects with `CS_PERMISSION_ERROR_CODE`. Lets the
 * worker, run-row writer, and `triggerRun` pre-flight produce a self-service
 * error message instead of a generic "WPP Open API error: 403".
 *
 * Extends `HttpException` so when the public `/agents` controller path lets
 * one bubble up, NestJS's default exception filter renders a proper 403 with
 * the human message instead of a generic 500.
 */
export class WppOpenPermissionError extends HttpException {
	static readonly MESSAGE =
		'Saved WPP Open project is not accessible from your current ' +
		'workspace. Open the task in a workspace where you have access ' +
		'to that project, or re-point the task to a project here.';

	readonly code = CS_PERMISSION_ERROR_CODE;
	readonly projectId?: string;

	constructor(projectId?: string) {
		super(
			{
				statusCode: HttpStatus.FORBIDDEN,
				code: CS_PERMISSION_ERROR_CODE,
				message: WppOpenPermissionError.MESSAGE,
				projectId,
			},
			HttpStatus.FORBIDDEN,
		);
		// HttpException's default `.message` is "Http Exception" when the
		// response is an object, so set it explicitly for log readability and
		// for callers that pull `error.message` directly.
		this.message = WppOpenPermissionError.MESSAGE;
		this.name = 'WppOpenPermissionError';
		this.projectId = projectId;
	}
}

/**
 * Thrown when CS rejects with `CS_AGENT_MISMATCH_ERROR_CODE` — the agent
 * exists, but is owned by a project other than the one we sent. The
 * canonical fix is for the user to re-point the task to a (project, agent)
 * pair that CS considers consistent.
 */
export class WppOpenAgentMismatchError extends HttpException {
	static readonly MESSAGE =
		'The saved WPP Open agent does not belong to the saved project. ' +
		'Open the task in Edit, pick an agent from the dropdown for this ' +
		'project, and save. No files were uploaded — they will be retried ' +
		'on the next run.';

	readonly code = CS_AGENT_MISMATCH_ERROR_CODE;
	readonly projectId?: string;
	readonly agentId?: string;

	constructor(projectId?: string, agentId?: string) {
		super(
			{
				statusCode: HttpStatus.BAD_REQUEST,
				code: CS_AGENT_MISMATCH_ERROR_CODE,
				message: WppOpenAgentMismatchError.MESSAGE,
				projectId,
				agentId,
			},
			HttpStatus.BAD_REQUEST,
		);
		this.message = WppOpenAgentMismatchError.MESSAGE;
		this.name = 'WppOpenAgentMismatchError';
		this.projectId = projectId;
		this.agentId = agentId;
	}
}

@Injectable()
export class WppOpenAgentService {
	private readonly logger = new Logger(WppOpenAgentService.name);

	/**
	 * Build CS authentication header.
	 * Format: CS {token},hierarchyAzId={azId}[,projectAzId={projectAzId}]
	 */
	private buildCSAuthHeader(
		token: string,
		osContext?: WppOpenOsContext,
	): string {
		if (!osContext?.hierarchy?.azId) {
			return `Bearer ${token}`;
		}

		let header = `CS ${token}`;
		header += `,hierarchyAzId=${osContext.hierarchy.azId}`;

		if (osContext.project?.azId) {
			header += `,projectAzId=${osContext.project.azId}`;
		}

		return header;
	}

	/**
	 * Make an authenticated request to the CS API.
	 */
	private async csRequest<T>(
		method: string,
		path: string,
		token: string,
		osContext?: WppOpenOsContext,
		body?: unknown,
	): Promise<T> {
		const url = `${CS_API_BASE}${path}`;
		const headers: Record<string, string> = {
			Authorization: this.buildCSAuthHeader(token, osContext),
			...CF_HEADERS,
		};

		// Only set Content-Type for methods that include a body
		if (body) {
			headers['Content-Type'] = 'application/json';
		}

		this.logger.debug(
			`CS API → ${method} ${path} | Auth: ${headers.Authorization.substring(0, 20)}...`,
		);

		let response: Response;
		try {
			response = await fetch(url, {
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined,
			});
		} catch (error) {
			this.logger.error(
				`CS API network error: ${method} ${path}: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw new HttpException(
				'WPP Open API is unreachable',
				HttpStatus.BAD_GATEWAY,
			);
		}

		if (!response.ok) {
			const errorText = await response
				.text()
				.catch(() => 'Unknown error');
			this.logger.error(
				`CS API error: ${method} ${path} → ${response.status}: ${errorText}`,
			);

			// Detect typed CS error codes so callers can map them to clear UX.
			// Anything else falls through to the generic HttpException.
			if (
				response.status === 403 &&
				errorText.includes(CS_PERMISSION_ERROR_CODE)
			) {
				const projectIdMatch = path.match(/projectId=([^&]+)/);
				throw new WppOpenPermissionError(
					projectIdMatch ? projectIdMatch[1] : undefined,
				);
			}

			if (
				response.status === 400 &&
				errorText.includes(CS_AGENT_MISMATCH_ERROR_CODE)
			) {
				// Path shape:  /v1/agent-configs/<projectId>/results/<agentId>
				const m = path.match(
					/\/agent-configs\/([^/]+)\/results\/([^/?#]+)/,
				);
				throw new WppOpenAgentMismatchError(
					m ? m[1] : undefined,
					m ? m[2] : undefined,
				);
			}

			throw new HttpException(
				`WPP Open API error: ${response.status}`,
				response.status >= 500
					? HttpStatus.BAD_GATEWAY
					: HttpStatus.BAD_REQUEST,
			);
		}

		this.logger.debug(`CS API ← ${method} ${path} → ${response.status}`);

		const json = await response.json();

		if (json === null || json === undefined) {
			throw new HttpException(
				'WPP Open API returned empty response',
				HttpStatus.BAD_GATEWAY,
			);
		}

		return json as T;
	}

	/**
	 * Upload content to S3 via the CS Transfer Service.
	 *
	 * 1. GET /transfer/upload-config/single/put → signed URL + bucket/key
	 * 2. PUT content to the signed URL
	 * 3. Return { bucket, key } as temporaryFileLocation
	 */
	async uploadToTransferService(
		token: string,
		content: string,
		contentType = 'text/markdown',
		osContext?: WppOpenOsContext,
	): Promise<{ bucket: string; key: string }> {
		// Step 1: Get upload config (response wrapped in { data: ... })
		const result = await this.csRequest<{ data: TransferUploadConfig }>(
			'GET',
			`/v1/transfer/upload-config/single/put?contentType=${encodeURIComponent(contentType)}`,
			token,
			osContext,
		);

		const config = result?.data;
		if (
			!config?.signedUrl ||
			!config?.temporaryFileLocation?.bucket ||
			!config?.temporaryFileLocation?.key
		) {
			this.logger.error(
				`Transfer Service invalid response: ${JSON.stringify(result)?.substring(0, 500)}`,
			);
			throw new HttpException(
				'Transfer Service returned invalid upload config',
				HttpStatus.BAD_GATEWAY,
			);
		}

		// Step 2: Upload content to S3 via signed URL
		const uploadResponse = await fetch(config.signedUrl, {
			method: 'PUT',
			headers: { 'Content-Type': contentType },
			body: content,
		});

		if (!uploadResponse.ok) {
			this.logger.error(
				`Transfer upload failed: ${uploadResponse.status}`,
			);
			throw new HttpException(
				'Failed to upload file to Transfer Service',
				HttpStatus.BAD_GATEWAY,
			);
		}

		this.logger.debug(
			`Uploaded to Transfer Service: bucket=${config.temporaryFileLocation.bucket}, key=${config.temporaryFileLocation.key} (${content.length} chars)`,
		);

		return config.temporaryFileLocation;
	}

	/**
	 * Resolve WPP Open project context to CS internal project ID.
	 */
	async resolveProjectId(
		token: string,
		osContext: WppOpenOsContext,
	): Promise<string> {
		const result = await this.csRequest<{
			data: { id: string };
		}>('PUT', '/v1/project/external/open', token, osContext, {
			osContext,
		});

		if (!result?.data?.id) {
			throw new HttpException(
				'WPP Open API: failed to resolve project ID',
				HttpStatus.BAD_GATEWAY,
			);
		}

		return result.data.id;
	}

	/**
	 * List available agents for a project.
	 *
	 * CS's `listAgents` is loose-scoped — it returns agents owned by other
	 * (sibling) projects under the same broader scope. To let the user
	 * re-point an agent without first switching to the agent's home
	 * workspace, we capture the agent's actual owning `projectId` from the
	 * response when CS surfaces it. The field name is read defensively
	 * across plausible CS conventions.
	 */
	async listAgents(
		token: string,
		projectId: string,
		osContext?: WppOpenOsContext,
	): Promise<WppOpenAgent[]> {
		const params = new URLSearchParams({ projectId });
		const result = await this.csRequest<{
			data: Record<string, unknown>[];
		}>('GET', `/v1/aihub/agents?${params}`, token, osContext);

		const agents = result.data || [];

		// One-time DEBUG snapshot so we can confirm the response shape in
		// production logs without re-deploying. Prints once per process,
		// only the first agent's keys (no values, no PII).
		if (agents.length > 0 && !WppOpenAgentService.loggedListAgentsShape) {
			WppOpenAgentService.loggedListAgentsShape = true;
			this.logger.debug(
				`listAgents response shape (first entry keys): ${Object.keys(
					agents[0],
				).join(', ')}`,
			);
		}

		return agents.map((agent) => ({
			id: String(agent.id ?? ''),
			name: String(agent.name ?? ''),
			description:
				typeof agent.description === 'string'
					? agent.description
					: undefined,
			category:
				typeof agent.category === 'string' ? agent.category : undefined,
			projectId: WppOpenAgentService.extractAgentProjectId(agent),
		}));
	}

	/**
	 * Print-once flag for the listAgents response shape, used to surface CS's
	 * actual agent fields in production logs without spamming.
	 */
	private static loggedListAgentsShape = false;

	/**
	 * Read the agent's owning project from a `listAgents` entry, trying a few
	 * plausible CS field names. Returns `undefined` if none match — callers
	 * fall back to resolving from osContext (legacy behavior).
	 */
	private static extractAgentProjectId(
		agent: Record<string, unknown>,
	): string | undefined {
		const candidates = [
			// CS's actual field name (confirmed via the one-time shape log
			// in production: agents come back with `agentProjectId`).
			'agentProjectId',
			'projectId',
			'project_id',
			'parentProjectId',
			'parent_project_id',
			'ownerProjectId',
			'owner_project_id',
		];
		for (const key of candidates) {
			const value = agent[key];
			if (typeof value === 'string' && value.length > 0) {
				return value;
			}
		}
		// Some CS responses nest a project object: { project: { id: '...' } }
		const project = agent['project'];
		if (
			project &&
			typeof project === 'object' &&
			typeof (project as { id?: unknown }).id === 'string'
		) {
			return (project as { id: string }).id;
		}
		return undefined;
	}

	/**
	 * Get full agent configuration including knowledge.
	 */
	async getAgentConfig(
		token: string,
		projectId: string,
		agentId: string,
		osContext?: WppOpenOsContext,
	): Promise<WppOpenAgentConfig> {
		const result = await this.csRequest<{
			data: WppOpenAgentConfig;
		}>(
			'GET',
			`/v1/agent-configs/${projectId}/results/${agentId}`,
			token,
			osContext,
		);

		if (!result?.data) {
			throw new HttpException(
				`WPP Open API: agent config not found for ${agentId}`,
				HttpStatus.BAD_GATEWAY,
			);
		}

		return result.data;
	}

	/**
	 * Update an agent's full configuration.
	 * Used to upsert knowledge documents into the agent.
	 */
	async updateAgentConfig(
		token: string,
		projectId: string,
		agentId: string,
		config: WppOpenAgentConfig,
		osContext?: WppOpenOsContext,
	): Promise<WppOpenAgentConfig> {
		const result = await this.csRequest<{
			data: WppOpenAgentConfig;
		}>(
			'PUT',
			`/v1/agent-configs/${projectId}/results/${agentId}`,
			token,
			osContext,
			config,
		);

		if (!result?.data) {
			throw new HttpException(
				`WPP Open API: failed to update agent config for ${agentId}`,
				HttpStatus.BAD_GATEWAY,
			);
		}

		return result.data;
	}

	/**
	 * Upsert knowledge documents into an agent's files.
	 *
	 * The CS API stores agent knowledge as `files` (S3-backed objects),
	 * not a separate `knowledge` field. The flow:
	 * 1. Upload each document to S3 via the Transfer Service
	 * 2. Build CSFileUploadItem objects with temporaryFileLocation
	 * 3. Merge with existing files (upsert by fileName)
	 * 4. PUT agent config with updated files array
	 */
	async upsertKnowledge(
		token: string,
		projectId: string,
		agentId: string,
		documents: WppOpenKnowledgeItem[],
		osContext?: WppOpenOsContext,
	): Promise<void> {
		// 1. Get current config
		const config = await this.getAgentConfig(
			token,
			projectId,
			agentId,
			osContext,
		);

		const existingFiles = (config.files || []) as CSFileItem[];
		this.logger.log(
			`Agent has ${existingFiles.length} existing files: ${existingFiles.map((f) => f.fileName).join(', ') || 'none'}`,
		);

		// 2. Upload each document to S3 via Transfer Service
		const uploadedFiles: CSFileUploadItem[] = [];
		for (const doc of documents) {
			const fileName = doc.title.endsWith('.md')
				? doc.title
				: `${doc.title}.md`;

			const location = await this.uploadToTransferService(
				token,
				doc.content,
				'text/markdown',
				osContext,
			);

			uploadedFiles.push({
				uid: randomUUID(),
				temporaryFileLocation: {
					bucket: location.bucket,
					key: location.key,
					metadata: {
						fileSizeInBytes: Buffer.byteLength(doc.content, 'utf8'),
					},
				},
				// Set optimizedFileLocation to same as temp so the backend
				// can read the content during updateS3Config
				optimizedFileLocation: {
					bucket: location.bucket,
					key: location.key,
				},
				fileName,
				content: doc.content,
				status: 'done',
			});

			this.logger.log(`Uploaded "${fileName}" to Transfer Service`);
		}

		// 3. Merge: keep existing files that aren't being replaced, add new uploads
		const newFileNames = new Set(uploadedFiles.map((f) => f.fileName));
		const retainedFiles = existingFiles.filter(
			(f) => !newFileNames.has(f.fileName || ''),
		);

		config.files = [...retainedFiles, ...uploadedFiles];

		this.logger.log(
			`Updating agent with ${config.files.length} total files (${retainedFiles.length} retained, ${uploadedFiles.length} new/updated)`,
		);

		// 4. PUT the updated config
		await this.updateAgentConfig(
			token,
			projectId,
			agentId,
			config,
			osContext,
		);

		this.logger.log(
			`Upserted ${documents.length} files into agent ${agentId}`,
		);
	}
}
