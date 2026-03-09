import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';

import {
	WppOpenAgent,
	WppOpenAgentConfig,
	WppOpenKnowledgeItem,
	WppOpenOsContext,
} from '../types/wpp-open.types';

/** Creative Studio API base */
const CS_API_BASE = 'https://creative.wpp.ai';

/** Required CloudFront headers for proper routing */
const CF_HEADERS = {
	Origin: 'https://open-web-cs.wpp.ai',
	Referer: 'https://open-web-cs.wpp.ai/',
};

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
			throw new HttpException(
				`WPP Open API error: ${response.status}`,
				response.status >= 500
					? HttpStatus.BAD_GATEWAY
					: HttpStatus.BAD_REQUEST,
			);
		}

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
	 * Resolve WPP Open project context to CS internal project ID.
	 */
	async resolveProjectId(
		token: string,
		osContext: WppOpenOsContext,
	): Promise<string> {
		const result = await this.csRequest<{
			data: { id: string };
		}>('PUT', '/v1/project/external/open', token, osContext, osContext);

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
	 */
	async listAgents(
		token: string,
		projectId: string,
		osContext?: WppOpenOsContext,
	): Promise<WppOpenAgent[]> {
		const params = new URLSearchParams({ projectId });
		const result = await this.csRequest<{
			data: {
				id: string;
				name: string;
				description?: string;
				category?: string;
			}[];
		}>('GET', `/v1/aihub/agents?${params}`, token, osContext);

		return (result.data || []).map((agent) => ({
			id: agent.id,
			name: agent.name,
			description: agent.description,
			category: agent.category,
		}));
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
	 * Upsert knowledge documents into an agent's config.
	 *
	 * Fetches the current config, merges knowledge items
	 * (update existing by title, add new), then PUTs the updated config.
	 */
	async upsertKnowledge(
		token: string,
		projectId: string,
		agentId: string,
		documents: WppOpenKnowledgeItem[],
		osContext?: WppOpenOsContext,
	): Promise<void> {
		// Get current config
		const config = await this.getAgentConfig(
			token,
			projectId,
			agentId,
			osContext,
		);

		// Merge knowledge: update existing by title, add new
		const existingKnowledge = config.knowledge || [];
		const knowledgeMap = new Map<string, WppOpenKnowledgeItem>();

		// Index existing by title
		for (const item of existingKnowledge) {
			knowledgeMap.set(item.title, item);
		}

		// Upsert new documents
		for (const doc of documents) {
			knowledgeMap.set(doc.title, doc);
		}

		config.knowledge = Array.from(knowledgeMap.values());

		// Update the agent config
		await this.updateAgentConfig(
			token,
			projectId,
			agentId,
			config,
			osContext,
		);

		this.logger.log(
			`Upserted ${documents.length} knowledge docs into agent ${agentId}`,
		);
	}
}
