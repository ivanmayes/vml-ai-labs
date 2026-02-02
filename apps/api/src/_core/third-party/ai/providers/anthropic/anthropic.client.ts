/**
 * Anthropic Client
 * Static utility class for Anthropic Claude API interactions
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
	MessageParam,
	ContentBlock,
} from '@anthropic-ai/sdk/resources/messages';

import {
	AIProvider,
	AIModel,
	AIMessageRole,
	AIFinishReason,
} from '../../models/enums';
import type {
	AITextRequest,
	AITextResponse,
	AITextStream,
	AIVisionRequest,
	AIVisionResponse,
	AIMessage,
	AIUsage,
	AIContentPart,
} from '../../models/interfaces';
import type { AnthropicConfig } from '../../models/config';
import { AIConfigurationError, parseProviderError } from '../../models/errors';

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AnthropicConfig = {
	apiKey: process.env.ANTHROPIC_API_KEY,
	defaultModel: AIModel.Claude35Sonnet,
	timeout: 60000,
	maxRetries: 3,
};

/**
 * Anthropic API client wrapper
 */
export class AnthropicClient {
	private static config: AnthropicConfig = { ...DEFAULT_CONFIG };

	/**
	 * Get or create Anthropic client instance
	 */
	private static getClient(configOverride?: AnthropicConfig): Anthropic {
		const config = { ...this.config, ...(configOverride ?? {}) };

		if (!config.apiKey) {
			throw new AIConfigurationError(
				'Anthropic API key is not configured',
				{
					provider: AIProvider.Anthropic,
					configKey: 'apiKey',
				},
			);
		}

		return new Anthropic({
			apiKey: config.apiKey,
			baseURL: config.baseUrl,
			timeout: config.timeout,
			maxRetries: config.maxRetries,
		});
	}

	/**
	 * Convert internal message format to Anthropic format
	 */
	private static convertMessages(messages: AIMessage[]): {
		systemPrompt?: string;
		messages: MessageParam[];
	} {
		let systemPrompt: string | undefined;
		const convertedMessages: MessageParam[] = [];

		for (const msg of messages) {
			// Extract system message
			if (msg.role === AIMessageRole.System) {
				if (typeof msg.content === 'string') {
					systemPrompt = systemPrompt
						? `${systemPrompt}\n\n${msg.content}`
						: msg.content;
				}
				continue;
			}

			// Handle tool result messages
			if (msg.role === AIMessageRole.Tool && msg.toolCallId) {
				convertedMessages.push({
					role: 'user',
					content: [
						{
							type: 'tool_result',
							tool_use_id: msg.toolCallId,
							content:
								typeof msg.content === 'string'
									? msg.content
									: JSON.stringify(msg.content),
						},
					],
				});
				continue;
			}

			// Handle assistant messages with tool calls
			if (msg.role === AIMessageRole.Assistant && msg.toolCalls?.length) {
				const content: ContentBlock[] = [];

				if (typeof msg.content === 'string' && msg.content) {
					content.push({
						type: 'text',
						text: msg.content,
					});
				}

				for (const tc of msg.toolCalls) {
					content.push({
						type: 'tool_use',
						id: tc.id,
						name: tc.function.name,
						input: JSON.parse(tc.function.arguments),
					});
				}

				convertedMessages.push({
					role: 'assistant',
					content: content as Anthropic.ContentBlock[],
				});
				continue;
			}

			// Handle multimodal content
			if (Array.isArray(msg.content)) {
				const content: (
					| Anthropic.TextBlockParam
					| Anthropic.ImageBlockParam
					| Anthropic.ToolUseBlockParam
					| Anthropic.ToolResultBlockParam
				)[] = [];

				for (const part of msg.content as AIContentPart[]) {
					if (part.type === 'text' && part.text) {
						content.push({
							type: 'text',
							text: part.text,
						});
					} else if (part.type === 'image' && part.image) {
						if (part.image.base64) {
							content.push({
								type: 'image',
								source: {
									type: 'base64',
									media_type: (part.image.mimeType ??
										'image/png') as
										| 'image/jpeg'
										| 'image/png'
										| 'image/gif'
										| 'image/webp',
									data: part.image.base64,
								},
							});
						}
						// URL images would require fetching first for Anthropic
					}
				}

				convertedMessages.push({
					role:
						msg.role === AIMessageRole.User ? 'user' : 'assistant',
					content,
				});
				continue;
			}

			// Simple text message
			convertedMessages.push({
				role: msg.role === AIMessageRole.User ? 'user' : 'assistant',
				content: msg.content,
			});
		}

		return { systemPrompt, messages: convertedMessages };
	}

	/**
	 * Parse Anthropic stop reason to internal format
	 */
	private static parseFinishReason(reason: string | null): AIFinishReason {
		switch (reason) {
			case 'end_turn':
				return AIFinishReason.Stop;
			case 'max_tokens':
				return AIFinishReason.Length;
			case 'tool_use':
				return AIFinishReason.ToolCalls;
			default:
				return AIFinishReason.Stop;
		}
	}

	/**
	 * Parse usage data
	 */
	private static parseUsage(usage?: {
		input_tokens: number;
		output_tokens: number;
	}): AIUsage | undefined {
		if (!usage) return undefined;
		return {
			promptTokens: usage.input_tokens,
			completionTokens: usage.output_tokens,
			totalTokens: usage.input_tokens + usage.output_tokens,
		};
	}

	/**
	 * Generate text completion
	 */
	public static async generateText(
		request: AITextRequest,
		configOverride?: AnthropicConfig,
	): Promise<AITextResponse> {
		const client = this.getClient(configOverride);
		const model =
			(request.model as string) ??
			configOverride?.defaultModel ??
			this.config.defaultModel ??
			AIModel.Claude35Sonnet;

		const { systemPrompt, messages } = this.convertMessages(
			request.messages,
		);

		try {
			const response = await client.messages.create({
				model,
				max_tokens: request.maxTokens ?? 4096,
				system: systemPrompt,
				messages,
				temperature: request.temperature,
				top_p: request.topP,
				stop_sequences:
					typeof request.stop === 'string'
						? [request.stop]
						: request.stop,
				tools: request.tools?.map((t) => ({
					name: t.function.name,
					description: t.function.description ?? '',
					input_schema: (t.function.parameters ?? {
						type: 'object',
						properties: {},
					}) as Anthropic.Tool.InputSchema,
				})),
				tool_choice:
					request.toolChoice === 'required'
						? { type: 'any' }
						: request.toolChoice === 'none'
							? { type: 'none' as unknown as 'auto' }
							: request.toolChoice === 'auto'
								? { type: 'auto' }
								: typeof request.toolChoice === 'object'
									? {
											type: 'tool',
											name: request.toolChoice.function
												.name,
										}
									: undefined,
			});

			// Extract text content and tool uses
			let textContent = '';
			const toolCalls: {
				id: string;
				type: 'function';
				function: { name: string; arguments: string };
			}[] = [];

			for (const block of response.content) {
				if (block.type === 'text') {
					textContent += block.text;
				} else if (block.type === 'tool_use') {
					toolCalls.push({
						id: block.id,
						type: 'function',
						function: {
							name: block.name,
							arguments: JSON.stringify(block.input),
						},
					});
				}
			}

			return {
				provider: AIProvider.Anthropic,
				model: response.model,
				content: textContent,
				finishReason: this.parseFinishReason(response.stop_reason),
				toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
				usage: this.parseUsage(response.usage),
				requestId: response.id,
			};
		} catch (error) {
			throw parseProviderError(error, AIProvider.Anthropic);
		}
	}

	/**
	 * Generate streaming text completion
	 */
	public static async *generateTextStream(
		request: AITextRequest,
		configOverride?: AnthropicConfig,
	): AITextStream {
		const client = this.getClient(configOverride);
		const model =
			(request.model as string) ??
			configOverride?.defaultModel ??
			this.config.defaultModel ??
			AIModel.Claude35Sonnet;

		const { systemPrompt, messages } = this.convertMessages(
			request.messages,
		);

		try {
			const stream = client.messages.stream({
				model,
				max_tokens: request.maxTokens ?? 4096,
				system: systemPrompt,
				messages,
				temperature: request.temperature,
				top_p: request.topP,
				stop_sequences:
					typeof request.stop === 'string'
						? [request.stop]
						: request.stop,
				tools: request.tools?.map((t) => ({
					name: t.function.name,
					description: t.function.description ?? '',
					input_schema: (t.function.parameters ?? {
						type: 'object',
						properties: {},
					}) as Anthropic.Tool.InputSchema,
				})),
			});

			let currentToolCall: {
				id: string;
				name: string;
				arguments: string;
			} | null = null;

			for await (const event of stream) {
				if (event.type === 'content_block_start') {
					if (event.content_block.type === 'tool_use') {
						currentToolCall = {
							id: event.content_block.id,
							name: event.content_block.name,
							arguments: '',
						};
					}
				} else if (event.type === 'content_block_delta') {
					if (event.delta.type === 'text_delta') {
						yield {
							content: event.delta.text,
						};
					} else if (
						event.delta.type === 'input_json_delta' &&
						currentToolCall
					) {
						currentToolCall.arguments += event.delta.partial_json;
					}
				} else if (event.type === 'content_block_stop') {
					if (currentToolCall) {
						yield {
							content: '',
							toolCalls: [
								{
									id: currentToolCall.id,
									type: 'function',
									function: {
										name: currentToolCall.name,
										arguments: currentToolCall.arguments,
									},
								},
							],
						};
						currentToolCall = null;
					}
				} else if (event.type === 'message_delta') {
					yield {
						content: '',
						finishReason: this.parseFinishReason(
							event.delta.stop_reason,
						),
						usage: event.usage
							? {
									promptTokens: 0,
									completionTokens: event.usage.output_tokens,
									totalTokens: event.usage.output_tokens,
								}
							: undefined,
					};
				}
			}
		} catch (error) {
			throw parseProviderError(error, AIProvider.Anthropic);
		}
	}

	/**
	 * Analyze image using Claude vision
	 */
	public static async analyzeImage(
		request: AIVisionRequest,
		configOverride?: AnthropicConfig,
	): Promise<AIVisionResponse> {
		const client = this.getClient(configOverride);
		const model =
			(request.model as string) ??
			configOverride?.defaultModel ??
			AIModel.Claude35Sonnet;

		try {
			const imageContent: (
				| Anthropic.TextBlockParam
				| Anthropic.ImageBlockParam
			)[] = [];

			for (const img of request.images) {
				if (img.base64) {
					imageContent.push({
						type: 'image',
						source: {
							type: 'base64',
							media_type: (img.mimeType ?? 'image/png') as
								| 'image/jpeg'
								| 'image/png'
								| 'image/gif'
								| 'image/webp',
							data: img.base64,
						},
					});
				}
				// URL images would require fetching first for Anthropic
			}

			imageContent.push({
				type: 'text',
				text: request.prompt,
			});

			const response = await client.messages.create({
				model,
				max_tokens: request.maxTokens ?? 4096,
				messages: [
					{
						role: 'user',
						content: imageContent,
					},
				],
				temperature: request.temperature,
			});

			let textContent = '';
			for (const block of response.content) {
				if (block.type === 'text') {
					textContent += block.text;
				}
			}

			return {
				provider: AIProvider.Anthropic,
				model: response.model,
				content: textContent,
				finishReason: this.parseFinishReason(response.stop_reason),
				usage: this.parseUsage(response.usage),
				requestId: response.id,
			};
		} catch (error) {
			throw parseProviderError(error, AIProvider.Anthropic);
		}
	}

	/**
	 * Update default configuration
	 */
	public static configure(config: Partial<AnthropicConfig>): void {
		this.config = { ...this.config, ...config };
	}
}
