/**
 * AI Service Configuration
 * Reads environment variables and builds global AI configuration
 */

import {
	AIProvider,
	AIModel,
	AIModality,
	type AIGlobalConfig,
	type AIProviderConfig,
	type AIDefaultProviders,
	type AIDefaultModels,
} from '../_core/third-party/ai';

/**
 * Parse provider from environment variable
 */
function parseProvider(value: string | undefined): AIProvider | undefined {
	if (!value) return undefined;
	const normalized = value.toLowerCase().trim();
	const providerMap: Record<string, AIProvider> = {
		openai: AIProvider.OpenAI,
		anthropic: AIProvider.Anthropic,
		google: AIProvider.Google,
		'azure-openai': AIProvider.AzureOpenAI,
		azureopenai: AIProvider.AzureOpenAI,
		azure: AIProvider.AzureOpenAI,
		bedrock: AIProvider.Bedrock,
		'aws-bedrock': AIProvider.Bedrock,
		awsbedrock: AIProvider.Bedrock,
	};
	return providerMap[normalized];
}

/**
 * Parse boolean from environment variable
 */
function parseBoolean(
	value: string | undefined,
	defaultValue = false,
): boolean {
	if (!value) return defaultValue;
	return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse number from environment variable
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
	if (!value) return defaultValue;
	const parsed = parseInt(value, 10);
	return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Build provider configuration from environment variables
 */
function buildProviderConfig(): AIProviderConfig {
	return {
		openai: {
			apiKey: process.env.OPENAI_API_KEY,
			organization: process.env.OPENAI_ORGANIZATION,
			baseUrl: process.env.OPENAI_BASE_URL,
			defaultModel: AIModel.GPT4o,
			timeout: parseNumber(process.env.AI_TIMEOUT, 60000),
			maxRetries: parseNumber(process.env.AI_MAX_RETRIES, 3),
		},
		anthropic: {
			apiKey: process.env.ANTHROPIC_API_KEY,
			baseUrl: process.env.ANTHROPIC_BASE_URL,
			defaultModel: AIModel.Claude35Sonnet,
			timeout: parseNumber(process.env.AI_TIMEOUT, 60000),
			maxRetries: parseNumber(process.env.AI_MAX_RETRIES, 3),
		},
		google: {
			apiKey: process.env.GOOGLE_AI_API_KEY,
			projectId: process.env.GOOGLE_CLOUD_PROJECT,
			location: process.env.GOOGLE_CLOUD_LOCATION,
			defaultModel: AIModel.Gemini15Pro,
			timeout: parseNumber(process.env.AI_TIMEOUT, 60000),
			maxRetries: parseNumber(process.env.AI_MAX_RETRIES, 3),
		},
		azureOpenai: {
			apiKey: process.env.AZURE_OPENAI_API_KEY,
			resourceName: process.env.AZURE_OPENAI_RESOURCE_NAME,
			deploymentId: process.env.AZURE_OPENAI_DEPLOYMENT_ID,
			apiVersion:
				process.env.AZURE_OPENAI_API_VERSION ?? '2024-08-01-preview',
			baseUrl: process.env.AZURE_OPENAI_BASE_URL,
			defaultModel: AIModel.GPT4o,
			timeout: parseNumber(process.env.AI_TIMEOUT, 60000),
			maxRetries: parseNumber(process.env.AI_MAX_RETRIES, 3),
		},
		bedrock: {
			// Bedrock-specific → generic AWS fallback (matches S3, SQS, Lambda pattern)
			region: process.env.AWS_BEDROCK_REGION ?? process.env.AWS_REGION,
			accessKeyId:
				process.env.AWS_BEDROCK_ACCESS_KEY_ID ??
				process.env.AWS_ACCESS_KEY_ID,
			secretAccessKey:
				process.env.AWS_BEDROCK_SECRET_ACCESS_KEY ??
				process.env.AWS_SECRET_ACCESS_KEY,
			sessionToken: process.env.AWS_SESSION_TOKEN,
			defaultModel: AIModel.BedrockClaude35Sonnet,
			timeout: parseNumber(process.env.AI_TIMEOUT, 60000),
			maxRetries: parseNumber(process.env.AI_MAX_RETRIES, 3),
		},
	};
}

/**
 * Build default provider mapping from environment variables
 */
function buildDefaultProviders(): AIDefaultProviders {
	return {
		[AIModality.Text]:
			parseProvider(process.env.AI_DEFAULT_TEXT_PROVIDER) ??
			AIProvider.OpenAI,
		[AIModality.Image]:
			parseProvider(process.env.AI_DEFAULT_IMAGE_PROVIDER) ??
			AIProvider.OpenAI,
		[AIModality.Vision]:
			parseProvider(process.env.AI_DEFAULT_VISION_PROVIDER) ??
			AIProvider.OpenAI,
		[AIModality.Audio]:
			parseProvider(process.env.AI_DEFAULT_AUDIO_PROVIDER) ??
			AIProvider.OpenAI,
		[AIModality.Embedding]:
			parseProvider(process.env.AI_DEFAULT_EMBEDDING_PROVIDER) ??
			AIProvider.OpenAI,
		[AIModality.Video]: undefined,
	};
}

/**
 * Build default model mapping
 */
function buildDefaultModels(): AIDefaultModels {
	return {
		[AIProvider.OpenAI]: {
			[AIModality.Text]: AIModel.GPT4o,
			[AIModality.Image]: AIModel.DALLE3,
			[AIModality.Vision]: AIModel.GPT4o,
			[AIModality.Audio]: AIModel.Whisper1,
			[AIModality.Embedding]: AIModel.TextEmbedding3Small,
		},
		[AIProvider.Anthropic]: {
			[AIModality.Text]: AIModel.Claude35Sonnet,
			[AIModality.Vision]: AIModel.Claude35Sonnet,
		},
		[AIProvider.Google]: {
			[AIModality.Text]: AIModel.Gemini15Pro,
			[AIModality.Vision]: AIModel.Gemini15Pro,
			[AIModality.Embedding]: AIModel.TextEmbedding004,
		},
		[AIProvider.AzureOpenAI]: {
			[AIModality.Text]: AIModel.GPT4o,
			[AIModality.Image]: AIModel.DALLE3,
			[AIModality.Vision]: AIModel.GPT4o,
			[AIModality.Audio]: AIModel.Whisper1,
			[AIModality.Embedding]: AIModel.TextEmbedding3Small,
		},
		[AIProvider.Bedrock]: {
			[AIModality.Text]: AIModel.BedrockClaude35Sonnet,
			[AIModality.Vision]: AIModel.BedrockClaude35Sonnet,
			[AIModality.Embedding]: AIModel.BedrockTitanEmbedV2,
			[AIModality.Image]: AIModel.BedrockTitanImage,
		},
	};
}

/**
 * Build global AI configuration
 */
export function buildAIConfig(): AIGlobalConfig {
	return {
		providers: buildProviderConfig(),
		defaultProviders: buildDefaultProviders(),
		defaultModels: buildDefaultModels(),
		logging: {
			enabled: parseBoolean(process.env.AI_LOGGING_ENABLED, true),
			logRequests: parseBoolean(process.env.AI_LOG_REQUESTS, false),
			logResponses: parseBoolean(process.env.AI_LOG_RESPONSES, false),
			logErrors: parseBoolean(process.env.AI_LOG_ERRORS, true),
			logUsage: parseBoolean(process.env.AI_LOG_USAGE, true),
			redactApiKeys: true,
		},
		costTracking: {
			enabled: parseBoolean(process.env.AI_COST_TRACKING_ENABLED, true),
			currency: 'USD',
			trackPerRequest: parseBoolean(
				process.env.AI_TRACK_PER_REQUEST,
				true,
			),
			alertThreshold: parseNumber(
				process.env.AI_COST_ALERT_THRESHOLD,
				100,
			),
		},
		retry: {
			maxRetries: parseNumber(process.env.AI_MAX_RETRIES, 3),
			initialDelayMs: parseNumber(
				process.env.AI_RETRY_INITIAL_DELAY,
				1000,
			),
			maxDelayMs: parseNumber(process.env.AI_RETRY_MAX_DELAY, 30000),
			backoffMultiplier: 2,
			retryableErrors: [
				'rate_limit_exceeded',
				'timeout',
				'service_unavailable',
				'internal_server_error',
				'ECONNRESET',
				'ETIMEDOUT',
			],
		},
		defaultTimeout: parseNumber(process.env.AI_TIMEOUT, 60000),
	};
}

/**
 * Global AI configuration instance
 */
export const AIConfig = buildAIConfig();
