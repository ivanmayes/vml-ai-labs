/**
 * OpenAI Client
 * Static utility class for OpenAI API interactions
 */

import OpenAI from 'openai';

import {
	AIProvider,
	AIModel,
	AIMessageRole,
	AIFinishReason,
	AIAudioFormat,
	AIVoice,
	AIImageSize,
	AIImageQuality,
	AIImageStyle,
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
	AISpeechToTextRequest,
	AISpeechToTextResponse,
	AITextToSpeechRequest,
	AITextToSpeechResponse,
	AIEmbeddingRequest,
	AIEmbeddingResponse,
	AIMessage,
	AIUsage,
	AIContentPart,
} from '../../models/interfaces';
import type { OpenAIConfig } from '../../models/config';
import {
	AIConfigurationError,
	AIProviderError,
	parseProviderError,
} from '../../models/errors';

/**
 * Default configuration
 */
const DEFAULT_CONFIG: OpenAIConfig = {
	apiKey: process.env.OPENAI_API_KEY,
	organization: process.env.OPENAI_ORGANIZATION,
	defaultModel: AIModel.GPT4o,
	timeout: 60000,
	maxRetries: 3,
};

/**
 * OpenAI API client wrapper
 */
export class OpenAIClient {
	private static config: OpenAIConfig = { ...DEFAULT_CONFIG };

	/**
	 * Get or create OpenAI client instance
	 */
	private static getClient(configOverride?: OpenAIConfig): OpenAI {
		const config = { ...this.config, ...(configOverride ?? {}) };

		if (!config.apiKey) {
			throw new AIConfigurationError('OpenAI API key is not configured', {
				provider: AIProvider.OpenAI,
				configKey: 'apiKey',
			});
		}

		return new OpenAI({
			apiKey: config.apiKey,
			organization: config.organization,
			baseURL: config.baseUrl,
			timeout: config.timeout,
			maxRetries: config.maxRetries,
		});
	}

	/**
	 * Convert internal message format to OpenAI format
	 */
	private static convertMessages(
		messages: AIMessage[],
	): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
		const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

		for (const msg of messages) {
			// Handle tool messages
			if (msg.role === AIMessageRole.Tool && msg.toolCallId) {
				result.push({
					role: 'tool',
					tool_call_id: msg.toolCallId,
					content:
						typeof msg.content === 'string'
							? msg.content
							: JSON.stringify(msg.content),
				});
				continue;
			}

			// Handle assistant messages with tool calls
			if (msg.role === AIMessageRole.Assistant && msg.toolCalls?.length) {
				result.push({
					role: 'assistant',
					content:
						typeof msg.content === 'string' ? msg.content : null,
					tool_calls: msg.toolCalls.map((tc) => ({
						id: tc.id,
						type: 'function' as const,
						function: {
							name: tc.function.name,
							arguments: tc.function.arguments,
						},
					})),
				});
				continue;
			}

			// Handle multimodal content for user messages
			if (Array.isArray(msg.content) && msg.role === AIMessageRole.User) {
				const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
					[];

				for (const part of msg.content as AIContentPart[]) {
					if (part.type === 'text' && part.text) {
						parts.push({
							type: 'text',
							text: part.text,
						});
					} else if (part.type === 'image' && part.image) {
						const imageUrl = part.image.url
							? part.image.url
							: `data:${part.image.mimeType ?? 'image/png'};base64,${part.image.base64}`;
						parts.push({
							type: 'image_url',
							image_url: {
								url: imageUrl,
								detail: part.image.detail ?? 'auto',
							},
						});
					}
				}

				result.push({
					role: 'user',
					content: parts,
				});
				continue;
			}

			// Handle system messages
			if (msg.role === AIMessageRole.System) {
				result.push({
					role: 'system',
					content:
						typeof msg.content === 'string'
							? msg.content
							: JSON.stringify(msg.content),
				});
				continue;
			}

			// Handle user messages
			if (msg.role === AIMessageRole.User) {
				result.push({
					role: 'user',
					content:
						typeof msg.content === 'string'
							? msg.content
							: JSON.stringify(msg.content),
				});
				continue;
			}

			// Handle assistant messages
			if (msg.role === AIMessageRole.Assistant) {
				result.push({
					role: 'assistant',
					content:
						typeof msg.content === 'string'
							? msg.content
							: JSON.stringify(msg.content),
				});
				continue;
			}
		}

		return result;
	}

	/**
	 * Parse OpenAI finish reason to internal format
	 */
	private static parseFinishReason(reason: string | null): AIFinishReason {
		switch (reason) {
			case 'stop':
				return AIFinishReason.Stop;
			case 'length':
				return AIFinishReason.Length;
			case 'content_filter':
				return AIFinishReason.ContentFilter;
			case 'tool_calls':
				return AIFinishReason.ToolCalls;
			default:
				return AIFinishReason.Stop;
		}
	}

	/**
	 * Parse usage data
	 */
	private static parseUsage(
		usage?: OpenAI.CompletionUsage,
	): AIUsage | undefined {
		if (!usage) return undefined;
		return {
			promptTokens: usage.prompt_tokens,
			completionTokens: usage.completion_tokens,
			totalTokens: usage.total_tokens,
		};
	}

	/**
	 * Generate text completion
	 */
	public static async generateText(
		request: AITextRequest,
		configOverride?: OpenAIConfig,
	): Promise<AITextResponse> {
		const client = this.getClient(configOverride);
		const model =
			(request.model as string) ??
			configOverride?.defaultModel ??
			this.config.defaultModel ??
			AIModel.GPT4o;

		try {
			const response = await client.chat.completions.create({
				model,
				messages: this.convertMessages(request.messages),
				max_tokens: request.maxTokens,
				temperature: request.temperature,
				top_p: request.topP,
				frequency_penalty: request.frequencyPenalty,
				presence_penalty: request.presencePenalty,
				stop: request.stop,
				tools: request.tools?.map((t) => ({
					type: 'function' as const,
					function: {
						name: t.function.name,
						description: t.function.description,
						parameters: t.function.parameters,
						strict: t.function.strict,
					},
				})),
				tool_choice: request.toolChoice as
					| 'auto'
					| 'none'
					| 'required'
					| undefined,
				response_format: request.responseFormat,
				seed: request.seed,
				user: request.user,
			});

			const choice = response.choices[0];

			return {
				provider: AIProvider.OpenAI,
				model: response.model,
				content: choice?.message?.content ?? '',
				finishReason: this.parseFinishReason(choice?.finish_reason),
				toolCalls: choice?.message?.tool_calls?.map((tc) => ({
					id: tc.id,
					type: 'function' as const,
					function: {
						name: tc.function.name,
						arguments: tc.function.arguments,
					},
				})),
				usage: this.parseUsage(response.usage),
				requestId: response.id,
			};
		} catch (error) {
			throw parseProviderError(error, AIProvider.OpenAI);
		}
	}

	/**
	 * Generate streaming text completion
	 */
	public static async *generateTextStream(
		request: AITextRequest,
		configOverride?: OpenAIConfig,
	): AITextStream {
		const client = this.getClient(configOverride);
		const model =
			(request.model as string) ??
			configOverride?.defaultModel ??
			this.config.defaultModel ??
			AIModel.GPT4o;

		try {
			const stream = await client.chat.completions.create({
				model,
				messages: this.convertMessages(request.messages),
				max_tokens: request.maxTokens,
				temperature: request.temperature,
				top_p: request.topP,
				frequency_penalty: request.frequencyPenalty,
				presence_penalty: request.presencePenalty,
				stop: request.stop,
				tools: request.tools?.map((t) => ({
					type: 'function' as const,
					function: {
						name: t.function.name,
						description: t.function.description,
						parameters: t.function.parameters,
						strict: t.function.strict,
					},
				})),
				tool_choice: request.toolChoice as
					| 'auto'
					| 'none'
					| 'required'
					| undefined,
				response_format: request.responseFormat,
				seed: request.seed,
				user: request.user,
				stream: true,
				stream_options: { include_usage: true },
			});

			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta;
				const finishReason = chunk.choices[0]?.finish_reason;

				const streamChunk: AITextStreamChunk = {
					content: delta?.content ?? '',
					finishReason: finishReason
						? this.parseFinishReason(finishReason)
						: undefined,
					toolCalls: delta?.tool_calls?.map((tc) => ({
						id: tc.id,
						type: 'function' as const,
						function: tc.function
							? {
									name: tc.function.name ?? '',
									arguments: tc.function.arguments ?? '',
								}
							: undefined,
					})),
					usage: chunk.usage
						? {
								promptTokens: chunk.usage.prompt_tokens,
								completionTokens: chunk.usage.completion_tokens,
								totalTokens: chunk.usage.total_tokens,
							}
						: undefined,
				};

				yield streamChunk;
			}
		} catch (error) {
			throw parseProviderError(error, AIProvider.OpenAI);
		}
	}

	/**
	 * Generate image using DALL-E
	 */
	public static async generateImage(
		request: AIImageRequest,
		configOverride?: OpenAIConfig,
	): Promise<AIImageResponse> {
		const client = this.getClient(configOverride);
		const model =
			(request.model as string) ??
			configOverride?.defaultModel ??
			AIModel.DALLE3;

		try {
			const response = await client.images.generate({
				model,
				prompt: request.prompt,
				n: request.n ?? 1,
				size:
					(request.size as
						| '256x256'
						| '512x512'
						| '1024x1024'
						| '1792x1024'
						| '1024x1792') ?? AIImageSize.Large,
				quality: request.quality ?? AIImageQuality.Standard,
				style: request.style ?? AIImageStyle.Vivid,
				response_format: request.responseFormat ?? 'url',
				user: request.user,
			});

			return {
				provider: AIProvider.OpenAI,
				model,
				images: (response.data ?? []).map((img) => ({
					url: img.url,
					base64: img.b64_json,
					revisedPrompt: img.revised_prompt,
				})),
			};
		} catch (error) {
			throw parseProviderError(error, AIProvider.OpenAI);
		}
	}

	/**
	 * Analyze image using vision model
	 */
	public static async analyzeImage(
		request: AIVisionRequest,
		configOverride?: OpenAIConfig,
	): Promise<AIVisionResponse> {
		const client = this.getClient(configOverride);
		const model =
			(request.model as string) ??
			configOverride?.defaultModel ??
			AIModel.GPT4o;

		try {
			const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
				request.images.map((img) => ({
					type: 'image_url' as const,
					image_url: {
						url: img.url
							? img.url
							: `data:${img.mimeType ?? 'image/png'};base64,${img.base64}`,
						detail: img.detail ?? 'auto',
					},
				}));

			const response = await client.chat.completions.create({
				model,
				messages: [
					{
						role: 'user',
						content: [
							{ type: 'text', text: request.prompt },
							...imageContent,
						],
					},
				],
				max_tokens: request.maxTokens ?? 4096,
				temperature: request.temperature,
			});

			const choice = response.choices[0];

			return {
				provider: AIProvider.OpenAI,
				model: response.model,
				content: choice?.message?.content ?? '',
				finishReason: this.parseFinishReason(choice?.finish_reason),
				usage: this.parseUsage(response.usage),
				requestId: response.id,
			};
		} catch (error) {
			throw parseProviderError(error, AIProvider.OpenAI);
		}
	}

	/**
	 * Convert speech to text using Whisper
	 */
	public static async speechToText(
		request: AISpeechToTextRequest,
		configOverride?: OpenAIConfig,
	): Promise<AISpeechToTextResponse> {
		const client = this.getClient(configOverride);
		const model = (request.model as string) ?? AIModel.Whisper1;

		try {
			// Create a File object from the audio data
			let audioFile: File;

			if (request.audio.file) {
				// Convert Buffer to Uint8Array for File constructor compatibility
				const fileData = new Uint8Array(request.audio.file);
				audioFile = new File([fileData], 'audio.wav', {
					type: request.audio.mimeType ?? 'audio/wav',
				});
			} else if (request.audio.base64) {
				const buffer = Buffer.from(request.audio.base64, 'base64');
				const uint8Array = new Uint8Array(buffer);
				audioFile = new File([uint8Array], 'audio.wav', {
					type: request.audio.mimeType ?? 'audio/wav',
				});
			} else {
				throw new AIProviderError(
					'Audio file, base64, or URL is required',
					{
						provider: AIProvider.OpenAI,
					},
				);
			}

			const response = await client.audio.transcriptions.create({
				file: audioFile,
				model,
				language: request.language,
				prompt: request.prompt,
				response_format:
					(request.responseFormat as
						| 'json'
						| 'text'
						| 'srt'
						| 'verbose_json'
						| 'vtt') ?? 'verbose_json',
				temperature: request.temperature,
				timestamp_granularities: request.timestampGranularities as
					| ('word' | 'segment')[]
					| undefined,
			});

			// Handle different response formats
			if (typeof response === 'string') {
				return {
					provider: AIProvider.OpenAI,
					model,
					text: response,
				};
			}

			// Type assertion for verbose response
			const verboseResponse = response as {
				text: string;
				language?: string;
				duration?: number;
				words?: { word: string; start: number; end: number }[];
				segments?: {
					id: number;
					start: number;
					end: number;
					text: string;
				}[];
			};

			return {
				provider: AIProvider.OpenAI,
				model,
				text: verboseResponse.text,
				language: verboseResponse.language,
				duration: verboseResponse.duration,
				words: verboseResponse.words?.map((w) => ({
					word: w.word,
					start: w.start,
					end: w.end,
				})),
				segments: verboseResponse.segments?.map((s) => ({
					id: s.id,
					start: s.start,
					end: s.end,
					text: s.text,
				})),
			};
		} catch (error) {
			throw parseProviderError(error, AIProvider.OpenAI);
		}
	}

	/**
	 * Convert text to speech using TTS
	 */
	public static async textToSpeech(
		request: AITextToSpeechRequest,
		configOverride?: OpenAIConfig,
	): Promise<AITextToSpeechResponse> {
		const client = this.getClient(configOverride);
		const model = (request.model as string) ?? AIModel.TTS1;

		try {
			const response = await client.audio.speech.create({
				model,
				input: request.text,
				voice:
					(request.voice as
						| 'alloy'
						| 'echo'
						| 'fable'
						| 'onyx'
						| 'nova'
						| 'shimmer') ?? AIVoice.Alloy,
				speed: request.speed ?? 1.0,
				response_format:
					(request.responseFormat as
						| 'mp3'
						| 'opus'
						| 'aac'
						| 'flac'
						| 'wav'
						| 'pcm') ?? AIAudioFormat.MP3,
			});

			const buffer = Buffer.from(await response.arrayBuffer());
			const format = request.responseFormat ?? AIAudioFormat.MP3;

			const contentTypeMap: Record<AIAudioFormat, string> = {
				[AIAudioFormat.MP3]: 'audio/mpeg',
				[AIAudioFormat.Opus]: 'audio/opus',
				[AIAudioFormat.AAC]: 'audio/aac',
				[AIAudioFormat.FLAC]: 'audio/flac',
				[AIAudioFormat.WAV]: 'audio/wav',
				[AIAudioFormat.PCM]: 'audio/pcm',
			};

			return {
				provider: AIProvider.OpenAI,
				model,
				audio: buffer,
				format,
				contentType: contentTypeMap[format],
			};
		} catch (error) {
			throw parseProviderError(error, AIProvider.OpenAI);
		}
	}

	/**
	 * Generate embeddings
	 */
	public static async generateEmbedding(
		request: AIEmbeddingRequest,
		configOverride?: OpenAIConfig,
	): Promise<AIEmbeddingResponse> {
		const client = this.getClient(configOverride);
		const model = (request.model as string) ?? AIModel.TextEmbedding3Small;

		try {
			const response = await client.embeddings.create({
				model,
				input: request.input,
				dimensions: request.dimensions,
				encoding_format: request.encodingFormat,
				user: request.user,
			});

			return {
				provider: AIProvider.OpenAI,
				model: response.model,
				embeddings: response.data.map((d) => d.embedding),
				dimensions:
					request.dimensions ??
					response.data[0]?.embedding?.length ??
					0,
				usage: {
					promptTokens: response.usage.prompt_tokens,
					completionTokens: 0,
					totalTokens: response.usage.total_tokens,
				},
			};
		} catch (error) {
			throw parseProviderError(error, AIProvider.OpenAI);
		}
	}

	/**
	 * Update default configuration
	 */
	public static configure(config: Partial<OpenAIConfig>): void {
		this.config = { ...this.config, ...config };
	}
}
