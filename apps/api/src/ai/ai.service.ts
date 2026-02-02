/**
 * AI Service
 * Injectable NestJS service that orchestrates AI provider interactions
 */

import { Injectable, Logger } from '@nestjs/common';

import {
	// Enums
	AIProvider,
	AIModality,
	AIModel,
	// Interfaces
	type AITextRequest,
	type AITextResponse,
	type AITextStream,
	type AIImageRequest,
	type AIImageResponse,
	type AIVisionRequest,
	type AIVisionResponse,
	type AISpeechToTextRequest,
	type AISpeechToTextResponse,
	type AITextToSpeechRequest,
	type AITextToSpeechResponse,
	type AIEmbeddingRequest,
	type AIEmbeddingResponse,
	type AIProviderCapabilities,
	type AIRequestConfig,
	// Providers
	OpenAIClient,
	AnthropicClient,
	GoogleClient,
	AzureOpenAIClient,
	BedrockClient,
	// Utilities
	RetryUtil,
	CostCalculator,
	// Errors
	AIError,
	AIModelNotSupportedError,
} from '../_core/third-party/ai';

import { AIConfig } from './ai.config';

@Injectable()
export class AIService {
	private readonly logger = new Logger(AIService.name);

	/**
	 * Resolve provider for a given modality
	 */
	private resolveProvider(
		requestProvider?: AIProvider,
		modality?: AIModality,
	): AIProvider {
		if (requestProvider) {
			return requestProvider;
		}

		if (modality && AIConfig.defaultProviders[modality]) {
			return AIConfig.defaultProviders[modality]!;
		}

		return AIProvider.OpenAI;
	}

	/**
	 * Resolve model for a given provider and modality
	 */
	private resolveModel(
		requestModel?: AIModel | string,
		provider?: AIProvider,
		modality?: AIModality,
	): string {
		if (requestModel) {
			return requestModel as string;
		}

		const resolvedProvider = provider ?? AIProvider.OpenAI;
		const providerModels = AIConfig.defaultModels[resolvedProvider] as
			| Record<string, AIModel>
			| undefined;

		if (modality && providerModels) {
			const modalityModel = providerModels[modality as string];
			if (modalityModel) {
				return modalityModel as string;
			}
		}

		// Fallback defaults per provider
		switch (resolvedProvider) {
			case AIProvider.OpenAI:
				return AIModel.GPT4o;
			case AIProvider.Anthropic:
				return AIModel.Claude35Sonnet;
			case AIProvider.Google:
				return AIModel.Gemini15Pro;
			case AIProvider.AzureOpenAI:
				return AIModel.GPT4o;
			case AIProvider.Bedrock:
				return AIModel.BedrockClaude35Sonnet;
			default:
				return AIModel.GPT4o;
		}
	}

	/**
	 * Log request if enabled
	 */
	private logRequest(
		operation: string,
		provider: AIProvider,
		model: string,
	): void {
		if (AIConfig.logging.enabled && AIConfig.logging.logRequests) {
			this.logger.log(
				`AI Request: ${operation} | Provider: ${provider} | Model: ${model}`,
			);
		}
	}

	/**
	 * Log response if enabled
	 */
	private logResponse(
		operation: string,
		provider: AIProvider,
		usage?: { promptTokens: number; completionTokens: number },
	): void {
		if (AIConfig.logging.enabled && AIConfig.logging.logUsage && usage) {
			const cost = CostCalculator.calculateTextCost(provider, '', {
				promptTokens: usage.promptTokens,
				completionTokens: usage.completionTokens,
				totalTokens: usage.promptTokens + usage.completionTokens,
			});
			this.logger.log(
				`AI Response: ${operation} | Input: ${usage.promptTokens} | Output: ${usage.completionTokens} | Cost: ${CostCalculator.formatCost(cost.totalCost)}`,
			);
		}
	}

	/**
	 * Log error if enabled
	 */
	private logError(operation: string, error: Error): void {
		if (AIConfig.logging.enabled && AIConfig.logging.logErrors) {
			this.logger.error(`AI Error: ${operation} | ${error.message}`);
		}
	}

	/**
	 * Generate text completion
	 */
	public async generateText(
		request: AITextRequest,
		config?: AIRequestConfig,
	): Promise<AITextResponse> {
		const provider = this.resolveProvider(
			config?.provider ?? request.provider,
			AIModality.Text,
		);
		const model = this.resolveModel(
			config?.model ?? request.model,
			provider,
			AIModality.Text,
		);

		this.logRequest('generateText', provider, model);

		const enrichedRequest = { ...request, model };

		try {
			const execute = async () => {
				switch (provider) {
					case AIProvider.OpenAI:
						return OpenAIClient.generateText(enrichedRequest);
					case AIProvider.Anthropic:
						return AnthropicClient.generateText(enrichedRequest);
					case AIProvider.Google:
						return GoogleClient.generateText(enrichedRequest);
					case AIProvider.AzureOpenAI:
						return AzureOpenAIClient.generateText(enrichedRequest);
					case AIProvider.Bedrock:
						return BedrockClient.generateText(enrichedRequest);
					default:
						throw new AIModelNotSupportedError(
							`Provider ${provider} is not supported for text generation`,
							{
								provider,
								requestedModel: model,
							},
						);
				}
			};

			const response = config?.skipRetry
				? await execute()
				: await RetryUtil.withRetry(execute, AIConfig.retry);

			this.logResponse('generateText', provider, response.usage);
			return response;
		} catch (error) {
			this.logError(
				'generateText',
				error instanceof Error ? error : new Error(String(error)),
			);
			throw error;
		}
	}

	/**
	 * Generate streaming text completion
	 */
	public async *generateTextStream(
		request: AITextRequest,
		config?: AIRequestConfig,
	): AITextStream {
		const provider = this.resolveProvider(
			config?.provider ?? request.provider,
			AIModality.Text,
		);
		const model = this.resolveModel(
			config?.model ?? request.model,
			provider,
			AIModality.Text,
		);

		this.logRequest('generateTextStream', provider, model);

		const enrichedRequest = { ...request, model };

		try {
			let stream: AITextStream;

			switch (provider) {
				case AIProvider.OpenAI:
					stream = OpenAIClient.generateTextStream(enrichedRequest);
					break;
				case AIProvider.Anthropic:
					stream =
						AnthropicClient.generateTextStream(enrichedRequest);
					break;
				case AIProvider.Google:
					stream = GoogleClient.generateTextStream(enrichedRequest);
					break;
				case AIProvider.AzureOpenAI:
					stream =
						AzureOpenAIClient.generateTextStream(enrichedRequest);
					break;
				case AIProvider.Bedrock:
					stream = BedrockClient.generateTextStream(enrichedRequest);
					break;
				default:
					throw new AIModelNotSupportedError(
						`Provider ${provider} is not supported for streaming text generation`,
						{
							provider,
							requestedModel: model,
						},
					);
			}

			for await (const chunk of stream) {
				yield chunk;
			}
		} catch (error) {
			this.logError(
				'generateTextStream',
				error instanceof Error ? error : new Error(String(error)),
			);
			throw error;
		}
	}

	/**
	 * Generate image
	 */
	public async generateImage(
		request: AIImageRequest,
		config?: AIRequestConfig,
	): Promise<AIImageResponse> {
		const provider = this.resolveProvider(
			config?.provider ?? request.provider,
			AIModality.Image,
		);
		const model = this.resolveModel(
			config?.model ?? request.model,
			provider,
			AIModality.Image,
		);

		this.logRequest('generateImage', provider, model);

		const enrichedRequest = { ...request, model };

		try {
			const execute = async () => {
				switch (provider) {
					case AIProvider.OpenAI:
						return OpenAIClient.generateImage(enrichedRequest);
					case AIProvider.AzureOpenAI:
						return AzureOpenAIClient.generateImage(enrichedRequest);
					case AIProvider.Bedrock:
						return BedrockClient.generateImage(enrichedRequest);
					default:
						throw new AIModelNotSupportedError(
							`Provider ${provider} is not supported for image generation`,
							{
								provider,
								requestedModel: model,
							},
						);
				}
			};

			const response = config?.skipRetry
				? await execute()
				: await RetryUtil.withRetry(execute, AIConfig.retry);

			return response;
		} catch (error) {
			this.logError(
				'generateImage',
				error instanceof Error ? error : new Error(String(error)),
			);
			throw error;
		}
	}

	/**
	 * Analyze image (vision)
	 */
	public async analyzeImage(
		request: AIVisionRequest,
		config?: AIRequestConfig,
	): Promise<AIVisionResponse> {
		const provider = this.resolveProvider(
			config?.provider ?? request.provider,
			AIModality.Vision,
		);
		const model = this.resolveModel(
			config?.model ?? request.model,
			provider,
			AIModality.Vision,
		);

		this.logRequest('analyzeImage', provider, model);

		const enrichedRequest = { ...request, model };

		try {
			const execute = async () => {
				switch (provider) {
					case AIProvider.OpenAI:
						return OpenAIClient.analyzeImage(enrichedRequest);
					case AIProvider.Anthropic:
						return AnthropicClient.analyzeImage(enrichedRequest);
					case AIProvider.Google:
						return GoogleClient.analyzeImage(enrichedRequest);
					case AIProvider.AzureOpenAI:
						return AzureOpenAIClient.analyzeImage(enrichedRequest);
					case AIProvider.Bedrock:
						return BedrockClient.analyzeImage(enrichedRequest);
					default:
						throw new AIModelNotSupportedError(
							`Provider ${provider} is not supported for vision analysis`,
							{
								provider,
								requestedModel: model,
							},
						);
				}
			};

			const response = config?.skipRetry
				? await execute()
				: await RetryUtil.withRetry(execute, AIConfig.retry);

			this.logResponse('analyzeImage', provider, response.usage);
			return response;
		} catch (error) {
			this.logError(
				'analyzeImage',
				error instanceof Error ? error : new Error(String(error)),
			);
			throw error;
		}
	}

	/**
	 * Convert speech to text
	 */
	public async speechToText(
		request: AISpeechToTextRequest,
		config?: AIRequestConfig,
	): Promise<AISpeechToTextResponse> {
		const provider = this.resolveProvider(
			config?.provider ?? request.provider,
			AIModality.Audio,
		);
		const model = this.resolveModel(
			config?.model ?? request.model,
			provider,
			AIModality.Audio,
		);

		this.logRequest('speechToText', provider, model);

		const enrichedRequest = { ...request, model };

		try {
			const execute = async () => {
				switch (provider) {
					case AIProvider.OpenAI:
						return OpenAIClient.speechToText(enrichedRequest);
					case AIProvider.AzureOpenAI:
						return AzureOpenAIClient.speechToText(enrichedRequest);
					default:
						throw new AIModelNotSupportedError(
							`Provider ${provider} is not supported for speech-to-text`,
							{
								provider,
								requestedModel: model,
							},
						);
				}
			};

			const response = config?.skipRetry
				? await execute()
				: await RetryUtil.withRetry(execute, AIConfig.retry);

			return response;
		} catch (error) {
			this.logError(
				'speechToText',
				error instanceof Error ? error : new Error(String(error)),
			);
			throw error;
		}
	}

	/**
	 * Convert text to speech
	 */
	public async textToSpeech(
		request: AITextToSpeechRequest,
		config?: AIRequestConfig,
	): Promise<AITextToSpeechResponse> {
		const provider = this.resolveProvider(
			config?.provider ?? request.provider,
			AIModality.Audio,
		);
		const model = this.resolveModel(
			config?.model ?? request.model,
			provider,
			AIModality.Audio,
		);

		this.logRequest('textToSpeech', provider, model);

		const enrichedRequest = { ...request, model };

		try {
			const execute = async () => {
				switch (provider) {
					case AIProvider.OpenAI:
						return OpenAIClient.textToSpeech(enrichedRequest);
					case AIProvider.AzureOpenAI:
						return AzureOpenAIClient.textToSpeech(enrichedRequest);
					default:
						throw new AIModelNotSupportedError(
							`Provider ${provider} is not supported for text-to-speech`,
							{
								provider,
								requestedModel: model,
							},
						);
				}
			};

			const response = config?.skipRetry
				? await execute()
				: await RetryUtil.withRetry(execute, AIConfig.retry);

			return response;
		} catch (error) {
			this.logError(
				'textToSpeech',
				error instanceof Error ? error : new Error(String(error)),
			);
			throw error;
		}
	}

	/**
	 * Generate embeddings
	 */
	public async generateEmbedding(
		request: AIEmbeddingRequest,
		config?: AIRequestConfig,
	): Promise<AIEmbeddingResponse> {
		const provider = this.resolveProvider(
			config?.provider ?? request.provider,
			AIModality.Embedding,
		);
		const model = this.resolveModel(
			config?.model ?? request.model,
			provider,
			AIModality.Embedding,
		);

		this.logRequest('generateEmbedding', provider, model);

		const enrichedRequest = { ...request, model };

		try {
			const execute = async () => {
				switch (provider) {
					case AIProvider.OpenAI:
						return OpenAIClient.generateEmbedding(enrichedRequest);
					case AIProvider.Google:
						return GoogleClient.generateEmbedding(enrichedRequest);
					case AIProvider.AzureOpenAI:
						return AzureOpenAIClient.generateEmbedding(
							enrichedRequest,
						);
					case AIProvider.Bedrock:
						return BedrockClient.generateEmbedding(enrichedRequest);
					default:
						throw new AIModelNotSupportedError(
							`Provider ${provider} is not supported for embeddings`,
							{
								provider,
								requestedModel: model,
							},
						);
				}
			};

			const response = config?.skipRetry
				? await execute()
				: await RetryUtil.withRetry(execute, AIConfig.retry);

			this.logResponse('generateEmbedding', provider, response.usage);
			return response;
		} catch (error) {
			this.logError(
				'generateEmbedding',
				error instanceof Error ? error : new Error(String(error)),
			);
			throw error;
		}
	}

	/**
	 * Get capabilities for a provider
	 */
	public getProviderCapabilities(
		provider: AIProvider,
	): AIProviderCapabilities {
		switch (provider) {
			case AIProvider.OpenAI:
				return {
					provider: AIProvider.OpenAI,
					textGeneration: true,
					streaming: true,
					imageGeneration: true,
					vision: true,
					speechToText: true,
					textToSpeech: true,
					embeddings: true,
					functionCalling: true,
					jsonMode: true,
					models: {
						text: [
							AIModel.GPT4o,
							AIModel.GPT4oMini,
							AIModel.GPT4Turbo,
							AIModel.GPT4,
							AIModel.GPT35Turbo,
							AIModel.O1,
							AIModel.O1Mini,
						],
						image: [AIModel.DALLE3, AIModel.DALLE2],
						vision: [AIModel.GPT4o, AIModel.GPT4Turbo],
						audio: [AIModel.Whisper1, AIModel.TTS1, AIModel.TTS1HD],
						embedding: [
							AIModel.TextEmbedding3Large,
							AIModel.TextEmbedding3Small,
							AIModel.TextEmbeddingAda002,
						],
					},
				};

			case AIProvider.Anthropic:
				return {
					provider: AIProvider.Anthropic,
					textGeneration: true,
					streaming: true,
					imageGeneration: false,
					vision: true,
					speechToText: false,
					textToSpeech: false,
					embeddings: false,
					functionCalling: true,
					jsonMode: false,
					models: {
						text: [
							AIModel.Claude35Sonnet,
							AIModel.Claude35Haiku,
							AIModel.Claude3Opus,
							AIModel.Claude3Sonnet,
							AIModel.Claude3Haiku,
						],
						vision: [
							AIModel.Claude35Sonnet,
							AIModel.Claude3Opus,
							AIModel.Claude3Sonnet,
						],
					},
				};

			case AIProvider.Google:
				return {
					provider: AIProvider.Google,
					textGeneration: true,
					streaming: true,
					imageGeneration: false,
					vision: true,
					speechToText: false,
					textToSpeech: false,
					embeddings: true,
					functionCalling: true,
					jsonMode: true,
					models: {
						text: [
							AIModel.Gemini15Pro,
							AIModel.Gemini15Flash,
							AIModel.Gemini15Flash8B,
							AIModel.Gemini10Pro,
						],
						vision: [
							AIModel.Gemini15Pro,
							AIModel.Gemini15Flash,
							AIModel.GeminiProVision,
						],
						embedding: [
							AIModel.TextEmbedding004,
							AIModel.Embedding001,
						],
					},
				};

			case AIProvider.AzureOpenAI:
				return {
					provider: AIProvider.AzureOpenAI,
					textGeneration: true,
					streaming: true,
					imageGeneration: true,
					vision: true,
					speechToText: true,
					textToSpeech: true,
					embeddings: true,
					functionCalling: true,
					jsonMode: true,
					models: {
						text: [
							AIModel.GPT4o,
							AIModel.GPT4oMini,
							AIModel.GPT4Turbo,
							AIModel.GPT4,
							AIModel.GPT35Turbo,
						],
						image: [AIModel.DALLE3],
						vision: [AIModel.GPT4o, AIModel.GPT4Turbo],
						audio: [AIModel.Whisper1, AIModel.TTS1, AIModel.TTS1HD],
						embedding: [
							AIModel.TextEmbedding3Large,
							AIModel.TextEmbedding3Small,
						],
					},
				};

			case AIProvider.Bedrock:
				return {
					provider: AIProvider.Bedrock,
					textGeneration: true,
					streaming: true,
					imageGeneration: true,
					vision: true,
					speechToText: false,
					textToSpeech: false,
					embeddings: true,
					functionCalling: true, // Claude on Bedrock supports tools
					jsonMode: false,
					models: {
						text: [
							AIModel.BedrockClaude35Sonnet,
							AIModel.BedrockClaude35Haiku,
							AIModel.BedrockClaude3Opus,
							AIModel.BedrockClaude3Sonnet,
							AIModel.BedrockClaude3Haiku,
							AIModel.BedrockLlama370B,
							AIModel.BedrockLlama38B,
							AIModel.BedrockMistralLarge,
							AIModel.BedrockMistral7B,
							AIModel.BedrockTitanTextPremier,
							AIModel.BedrockTitanTextExpress,
						],
						image: [AIModel.BedrockTitanImage],
						vision: [
							AIModel.BedrockClaude35Sonnet,
							AIModel.BedrockClaude35Haiku,
							AIModel.BedrockClaude3Opus,
							AIModel.BedrockClaude3Sonnet,
							AIModel.BedrockClaude3Haiku,
						],
						embedding: [
							AIModel.BedrockTitanEmbedV2,
							AIModel.BedrockTitanEmbedV1,
						],
					},
				};

			default:
				throw new AIError(`Unknown provider: ${provider}`);
		}
	}

	/**
	 * List all available providers
	 */
	public listProviders(): AIProvider[] {
		return Object.values(AIProvider);
	}

	/**
	 * Check if a provider is configured
	 */
	public isProviderConfigured(provider: AIProvider): boolean {
		switch (provider) {
			case AIProvider.OpenAI:
				return !!AIConfig.providers.openai?.apiKey;
			case AIProvider.Anthropic:
				return !!AIConfig.providers.anthropic?.apiKey;
			case AIProvider.Google:
				return !!AIConfig.providers.google?.apiKey;
			case AIProvider.AzureOpenAI:
				return !!(
					AIConfig.providers.azureOpenai?.apiKey &&
					(AIConfig.providers.azureOpenai?.resourceName ||
						AIConfig.providers.azureOpenai?.baseUrl)
				);
			case AIProvider.Bedrock:
				// Configured if: running on AWS (IAM role) OR has explicit credentials
				return !!(
					process.env.RUNTIME_ENVIRONMENT === 'aws' ||
					(AIConfig.providers.bedrock?.region &&
						AIConfig.providers.bedrock?.accessKeyId)
				);
			default:
				return false;
		}
	}
}
