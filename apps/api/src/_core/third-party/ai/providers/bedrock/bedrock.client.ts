/**
 * Amazon Bedrock Client
 * Static utility class for AWS Bedrock API interactions
 *
 * Uses the Converse/ConverseStream APIs for unified model access
 * Supports: Text generation, streaming, vision (Claude 3), embeddings (Titan), image generation (Titan)
 */

import {
	BedrockRuntimeClient,
	ConverseCommand,
	ConverseStreamCommand,
	InvokeModelCommand,
	type BedrockRuntimeClientConfig,
	type Message,
	type ContentBlock,
	type SystemContentBlock,
	type ToolConfiguration,
	type Tool,
	type ConverseStreamOutput,
} from '@aws-sdk/client-bedrock-runtime';
import type { DocumentType } from '@smithy/types';

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
	AITextStreamChunk,
	AIImageRequest,
	AIImageResponse,
	AIVisionRequest,
	AIVisionResponse,
	AIEmbeddingRequest,
	AIEmbeddingResponse,
	AIMessage,
	AIUsage,
	AIContentPart,
} from '../../models/interfaces';
import type { BedrockConfig } from '../../models/config';
import { parseProviderError } from '../../models/errors';

/**
 * Default configuration with AWS credential fallback chain
 */
const DEFAULT_CONFIG: BedrockConfig = {
	region:
		process.env.AWS_BEDROCK_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
	accessKeyId:
		process.env.AWS_BEDROCK_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey:
		process.env.AWS_BEDROCK_SECRET_ACCESS_KEY ??
		process.env.AWS_SECRET_ACCESS_KEY,
	sessionToken: process.env.AWS_SESSION_TOKEN,
	defaultModel: AIModel.BedrockClaude35Sonnet,
	timeout: 60000,
	maxRetries: 3,
};

/**
 * Amazon Bedrock API client wrapper
 */
export class BedrockClient {
	private static config: BedrockConfig = { ...DEFAULT_CONFIG };

	/**
	 * Get or create Bedrock client instance
	 * Follows AWS credential fallback pattern: explicit config → env vars → IAM role
	 */
	private static getClient(
		configOverride?: BedrockConfig,
	): BedrockRuntimeClient {
		const config = { ...this.config, ...(configOverride ?? {}) };

		// Region with fallback chain
		const region =
			config.region ??
			process.env.AWS_BEDROCK_REGION ??
			process.env.AWS_REGION ??
			'us-east-1';

		const clientConfig: BedrockRuntimeClientConfig = {
			region,
		};

		// Skip manual credentials when running on AWS (IAM role injection)
		// This pattern matches S3, SQS, Lambda in the codebase
		if (process.env.RUNTIME_ENVIRONMENT !== 'aws') {
			const accessKeyId =
				config.accessKeyId ??
				process.env.AWS_BEDROCK_ACCESS_KEY_ID ??
				process.env.AWS_ACCESS_KEY_ID;

			const secretAccessKey =
				config.secretAccessKey ??
				process.env.AWS_BEDROCK_SECRET_ACCESS_KEY ??
				process.env.AWS_SECRET_ACCESS_KEY;

			if (accessKeyId && secretAccessKey) {
				clientConfig.credentials = {
					accessKeyId,
					secretAccessKey,
					sessionToken:
						config.sessionToken ?? process.env.AWS_SESSION_TOKEN,
				};
			}
		}

		return new BedrockRuntimeClient(clientConfig);
	}

	/**
	 * Convert internal message format to Bedrock Converse format
	 */
	private static convertMessages(messages: AIMessage[]): {
		systemPrompt?: SystemContentBlock[];
		messages: Message[];
	} {
		let systemPrompt: SystemContentBlock[] | undefined;
		const convertedMessages: Message[] = [];

		for (const msg of messages) {
			// Extract system message
			if (msg.role === AIMessageRole.System) {
				if (typeof msg.content === 'string') {
					systemPrompt = systemPrompt ?? [];
					systemPrompt.push({ text: msg.content });
				}
				continue;
			}

			// Handle tool result messages
			if (msg.role === AIMessageRole.Tool && msg.toolCallId) {
				convertedMessages.push({
					role: 'user',
					content: [
						{
							toolResult: {
								toolUseId: msg.toolCallId,
								content: [
									{
										text:
											typeof msg.content === 'string'
												? msg.content
												: JSON.stringify(msg.content),
									},
								],
							},
						},
					],
				});
				continue;
			}

			// Handle assistant messages with tool calls
			if (msg.role === AIMessageRole.Assistant && msg.toolCalls?.length) {
				const content: ContentBlock[] = [];

				if (typeof msg.content === 'string' && msg.content) {
					content.push({ text: msg.content });
				}

				for (const tc of msg.toolCalls) {
					let parsedInput: DocumentType;
					try {
						parsedInput = JSON.parse(
							tc.function.arguments,
						) as DocumentType;
					} catch {
						// If arguments is not valid JSON, wrap it as a string
						parsedInput = { raw: tc.function.arguments };
					}
					content.push({
						toolUse: {
							toolUseId: tc.id,
							name: tc.function.name,
							input: parsedInput,
						},
					});
				}

				convertedMessages.push({
					role: 'assistant',
					content,
				});
				continue;
			}

			// Handle multimodal content
			if (Array.isArray(msg.content)) {
				const content: ContentBlock[] = [];

				for (const part of msg.content as AIContentPart[]) {
					if (part.type === 'text' && part.text) {
						content.push({ text: part.text });
					} else if (part.type === 'image' && part.image?.base64) {
						content.push({
							image: {
								format: this.getMimeFormat(
									part.image.mimeType ?? 'image/png',
								),
								source: {
									bytes: Buffer.from(
										part.image.base64,
										'base64',
									),
								},
							},
						});
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
				content: [{ text: msg.content }],
			});
		}

		return { systemPrompt, messages: convertedMessages };
	}

	/**
	 * Convert MIME type to Bedrock image format
	 */
	private static getMimeFormat(
		mimeType: string,
	): 'jpeg' | 'png' | 'gif' | 'webp' {
		switch (mimeType) {
			case 'image/jpeg':
				return 'jpeg';
			case 'image/gif':
				return 'gif';
			case 'image/webp':
				return 'webp';
			case 'image/png':
			default:
				return 'png';
		}
	}

	/**
	 * Convert tools to Bedrock format
	 */
	private static convertTools(
		tools: AITextRequest['tools'],
	): ToolConfiguration | undefined {
		if (!tools?.length) return undefined;

		const bedrockTools = tools.map((t) => ({
			toolSpec: {
				name: t.function.name,
				description: t.function.description,
				inputSchema: {
					json: t.function.parameters ?? { type: 'object' },
				},
			},
		})) as Tool[];

		return { tools: bedrockTools };
	}

	/**
	 * Parse Bedrock stop reason to internal format
	 */
	private static parseFinishReason(
		reason: string | undefined,
	): AIFinishReason {
		switch (reason) {
			case 'end_turn':
			case 'stop_sequence':
				return AIFinishReason.Stop;
			case 'max_tokens':
				return AIFinishReason.Length;
			case 'tool_use':
				return AIFinishReason.ToolCalls;
			case 'content_filtered':
				return AIFinishReason.ContentFilter;
			default:
				return AIFinishReason.Stop;
		}
	}

	/**
	 * Parse usage data from Bedrock response
	 */
	private static parseUsage(usage?: {
		inputTokens?: number;
		outputTokens?: number;
	}): AIUsage | undefined {
		if (!usage) return undefined;
		const inputTokens = usage.inputTokens ?? 0;
		const outputTokens = usage.outputTokens ?? 0;
		return {
			promptTokens: inputTokens,
			completionTokens: outputTokens,
			totalTokens: inputTokens + outputTokens,
		};
	}

	/**
	 * Generate text completion using Converse API
	 */
	public static async generateText(
		request: AITextRequest,
		configOverride?: BedrockConfig,
	): Promise<AITextResponse> {
		const client = this.getClient(configOverride);
		const model =
			(request.model as string) ??
			configOverride?.defaultModel ??
			this.config.defaultModel ??
			AIModel.BedrockClaude35Sonnet;

		const { systemPrompt, messages } = this.convertMessages(
			request.messages,
		);

		try {
			const command = new ConverseCommand({
				modelId: model,
				system: systemPrompt,
				messages,
				inferenceConfig: {
					maxTokens: request.maxTokens ?? 4096,
					temperature: request.temperature,
					topP: request.topP,
					stopSequences:
						typeof request.stop === 'string'
							? [request.stop]
							: request.stop,
				},
				toolConfig: this.convertTools(request.tools),
			});

			const response = await client.send(command);

			// Extract text content and tool uses
			let textContent = '';
			const toolCalls: {
				id: string;
				type: 'function';
				function: { name: string; arguments: string };
			}[] = [];

			for (const block of response.output?.message?.content ?? []) {
				if ('text' in block && block.text) {
					textContent += block.text;
				} else if ('toolUse' in block && block.toolUse) {
					toolCalls.push({
						id: block.toolUse.toolUseId ?? '',
						type: 'function',
						function: {
							name: block.toolUse.name ?? '',
							arguments: JSON.stringify(block.toolUse.input),
						},
					});
				}
			}

			return {
				provider: AIProvider.Bedrock,
				model,
				content: textContent,
				finishReason: this.parseFinishReason(response.stopReason),
				toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
				usage: this.parseUsage(response.usage),
				requestId: response.$metadata?.requestId,
			};
		} catch (error) {
			throw parseProviderError(error, AIProvider.Bedrock);
		}
	}

	/**
	 * Generate streaming text completion using ConverseStream API
	 */
	public static async *generateTextStream(
		request: AITextRequest,
		configOverride?: BedrockConfig,
	): AITextStream {
		const client = this.getClient(configOverride);
		const model =
			(request.model as string) ??
			configOverride?.defaultModel ??
			this.config.defaultModel ??
			AIModel.BedrockClaude35Sonnet;

		const { systemPrompt, messages } = this.convertMessages(
			request.messages,
		);

		try {
			const command = new ConverseStreamCommand({
				modelId: model,
				system: systemPrompt,
				messages,
				inferenceConfig: {
					maxTokens: request.maxTokens ?? 4096,
					temperature: request.temperature,
					topP: request.topP,
					stopSequences:
						typeof request.stop === 'string'
							? [request.stop]
							: request.stop,
				},
				toolConfig: this.convertTools(request.tools),
			});

			const response = await client.send(command);

			if (!response.stream) {
				return;
			}

			let currentToolCall: {
				id: string;
				name: string;
				arguments: string;
			} | null = null;

			for await (const event of response.stream) {
				const streamEvent = event as ConverseStreamOutput;

				// Handle content block start (tool use)
				if (
					'contentBlockStart' in streamEvent &&
					streamEvent.contentBlockStart?.start
				) {
					const start = streamEvent.contentBlockStart.start;
					if ('toolUse' in start && start.toolUse) {
						currentToolCall = {
							id: start.toolUse.toolUseId ?? '',
							name: start.toolUse.name ?? '',
							arguments: '',
						};
					}
				}

				// Handle content block delta
				if (
					'contentBlockDelta' in streamEvent &&
					streamEvent.contentBlockDelta?.delta
				) {
					const delta = streamEvent.contentBlockDelta.delta;

					if ('text' in delta && delta.text) {
						yield { content: delta.text };
					} else if (
						'toolUse' in delta &&
						delta.toolUse?.input &&
						currentToolCall
					) {
						currentToolCall.arguments += delta.toolUse.input;
					}
				}

				// Handle content block stop
				if ('contentBlockStop' in streamEvent && currentToolCall) {
					const chunk: AITextStreamChunk = {
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
					yield chunk;
					currentToolCall = null;
				}

				// Handle message stop with metadata
				if ('messageStop' in streamEvent) {
					yield {
						content: '',
						finishReason: this.parseFinishReason(
							streamEvent.messageStop?.stopReason,
						),
					};
				}

				// Handle usage metadata
				if ('metadata' in streamEvent && streamEvent.metadata?.usage) {
					yield {
						content: '',
						usage: this.parseUsage(streamEvent.metadata.usage),
					};
				}
			}
		} catch (error) {
			throw parseProviderError(error, AIProvider.Bedrock);
		}
	}

	/**
	 * Analyze image using Claude 3 vision via Converse API
	 */
	public static async analyzeImage(
		request: AIVisionRequest,
		configOverride?: BedrockConfig,
	): Promise<AIVisionResponse> {
		const client = this.getClient(configOverride);
		const model =
			(request.model as string) ??
			configOverride?.defaultModel ??
			this.config.defaultModel ??
			AIModel.BedrockClaude35Sonnet;

		try {
			// Build image content blocks
			const content: ContentBlock[] = [];

			for (const img of request.images) {
				if (img.base64) {
					content.push({
						image: {
							format: this.getMimeFormat(
								img.mimeType ?? 'image/png',
							),
							source: {
								bytes: Buffer.from(img.base64, 'base64'),
							},
						},
					});
				}
			}

			content.push({ text: request.prompt });

			const command = new ConverseCommand({
				modelId: model,
				messages: [
					{
						role: 'user',
						content,
					},
				],
				inferenceConfig: {
					maxTokens: request.maxTokens ?? 4096,
					temperature: request.temperature,
				},
			});

			const response = await client.send(command);

			let textContent = '';
			for (const block of response.output?.message?.content ?? []) {
				if ('text' in block && block.text) {
					textContent += block.text;
				}
			}

			return {
				provider: AIProvider.Bedrock,
				model,
				content: textContent,
				finishReason: this.parseFinishReason(response.stopReason),
				usage: this.parseUsage(response.usage),
				requestId: response.$metadata?.requestId,
			};
		} catch (error) {
			throw parseProviderError(error, AIProvider.Bedrock);
		}
	}

	/**
	 * Generate embeddings using Titan Embeddings
	 * Uses InvokeModel as Titan Embed doesn't support Converse API
	 */
	public static async generateEmbedding(
		request: AIEmbeddingRequest,
		configOverride?: BedrockConfig,
	): Promise<AIEmbeddingResponse> {
		const client = this.getClient(configOverride);
		const model =
			(request.model as string) ??
			configOverride?.defaultModel ??
			this.config.defaultModel ??
			AIModel.BedrockTitanEmbedV2;

		const texts = Array.isArray(request.input)
			? request.input
			: [request.input];

		try {
			const embeddings: number[][] = [];
			let totalTokens = 0;

			for (const text of texts) {
				const requestBody: Record<string, unknown> = {
					inputText: text,
				};

				// Add dimensions for v2 model
				if (
					request.dimensions &&
					model.includes('titan-embed-text-v2')
				) {
					requestBody.dimensions = request.dimensions;
				}

				const command = new InvokeModelCommand({
					modelId: model,
					contentType: 'application/json',
					accept: 'application/json',
					body: JSON.stringify(requestBody),
				});

				const response = await client.send(command);

				if (!response.body) {
					throw new Error('Empty response body from Bedrock');
				}

				const result = JSON.parse(
					new TextDecoder().decode(response.body),
				);

				embeddings.push(result.embedding);
				totalTokens += result.inputTextTokenCount ?? 0;
			}

			return {
				provider: AIProvider.Bedrock,
				model,
				embeddings,
				dimensions: request.dimensions ?? embeddings[0]?.length ?? 1024,
				usage: {
					promptTokens: totalTokens,
					completionTokens: 0,
					totalTokens,
				},
			};
		} catch (error) {
			throw parseProviderError(error, AIProvider.Bedrock);
		}
	}

	/**
	 * Generate image using Titan Image Generator
	 * Uses InvokeModel as image generation doesn't support Converse API
	 */
	public static async generateImage(
		request: AIImageRequest,
		configOverride?: BedrockConfig,
	): Promise<AIImageResponse> {
		const client = this.getClient(configOverride);
		const model =
			(request.model as string) ??
			configOverride?.defaultModel ??
			this.config.defaultModel ??
			AIModel.BedrockTitanImage;

		try {
			// Parse size string to width/height
			const [width, height] = (request.size ?? '1024x1024')
				.split('x')
				.map(Number);

			const requestBody = {
				taskType: 'TEXT_IMAGE',
				textToImageParams: {
					text: request.prompt,
				},
				imageGenerationConfig: {
					numberOfImages: request.n ?? 1,
					width: width || 1024,
					height: height || 1024,
					quality: request.quality === 'hd' ? 'premium' : 'standard',
				},
			};

			const command = new InvokeModelCommand({
				modelId: model,
				contentType: 'application/json',
				accept: 'application/json',
				body: JSON.stringify(requestBody),
			});

			const response = await client.send(command);

			if (!response.body) {
				throw new Error('Empty response body from Bedrock');
			}

			const result = JSON.parse(new TextDecoder().decode(response.body));

			// Titan returns images as base64
			const images = (result.images ?? []).map((base64: string) => ({
				base64,
			}));

			return {
				provider: AIProvider.Bedrock,
				model,
				images,
			};
		} catch (error) {
			throw parseProviderError(error, AIProvider.Bedrock);
		}
	}

	/**
	 * Update default configuration
	 */
	public static configure(config: Partial<BedrockConfig>): void {
		this.config = { ...this.config, ...config };
	}
}
