/**
 * AI Provider Configuration Types
 */

import { AIProvider, AIModel, AIModality } from './enums';

/**
 * OpenAI-specific configuration
 */
export interface OpenAIConfig {
	apiKey?: string;
	organization?: string;
	baseUrl?: string;
	defaultModel?: AIModel;
	timeout?: number;
	maxRetries?: number;
}

/**
 * Anthropic-specific configuration
 */
export interface AnthropicConfig {
	apiKey?: string;
	baseUrl?: string;
	defaultModel?: AIModel;
	timeout?: number;
	maxRetries?: number;
}

/**
 * Google AI-specific configuration
 */
export interface GoogleAIConfig {
	apiKey?: string;
	projectId?: string;
	location?: string;
	defaultModel?: AIModel;
	timeout?: number;
	maxRetries?: number;
}

/**
 * Azure OpenAI-specific configuration
 */
export interface AzureOpenAIConfig {
	apiKey?: string;
	resourceName?: string;
	deploymentId?: string;
	apiVersion?: string;
	baseUrl?: string;
	defaultModel?: AIModel;
	timeout?: number;
	maxRetries?: number;
}

/**
 * Amazon Bedrock-specific configuration
 */
export interface BedrockConfig {
	region?: string;
	accessKeyId?: string;
	secretAccessKey?: string;
	sessionToken?: string; // For temporary credentials (STS)
	defaultModel?: AIModel;
	timeout?: number;
	maxRetries?: number;
}

/**
 * Per-provider configuration
 */
export interface AIProviderConfig {
	openai?: OpenAIConfig;
	anthropic?: AnthropicConfig;
	google?: GoogleAIConfig;
	azureOpenai?: AzureOpenAIConfig;
	bedrock?: BedrockConfig;
}

/**
 * Default provider mapping per modality
 */
export interface AIDefaultProviders {
	[AIModality.Text]?: AIProvider;
	[AIModality.Image]?: AIProvider;
	[AIModality.Vision]?: AIProvider;
	[AIModality.Audio]?: AIProvider;
	[AIModality.Embedding]?: AIProvider;
	[AIModality.Video]?: AIProvider;
}

/**
 * Default model mapping per modality and provider
 */
export interface AIDefaultModels {
	[AIProvider.OpenAI]?: {
		[AIModality.Text]?: AIModel;
		[AIModality.Image]?: AIModel;
		[AIModality.Vision]?: AIModel;
		[AIModality.Audio]?: AIModel;
		[AIModality.Embedding]?: AIModel;
	};
	[AIProvider.Anthropic]?: {
		[AIModality.Text]?: AIModel;
		[AIModality.Vision]?: AIModel;
	};
	[AIProvider.Google]?: {
		[AIModality.Text]?: AIModel;
		[AIModality.Vision]?: AIModel;
		[AIModality.Embedding]?: AIModel;
	};
	[AIProvider.AzureOpenAI]?: {
		[AIModality.Text]?: AIModel;
		[AIModality.Image]?: AIModel;
		[AIModality.Vision]?: AIModel;
		[AIModality.Audio]?: AIModel;
		[AIModality.Embedding]?: AIModel;
	};
	[AIProvider.Bedrock]?: {
		[AIModality.Text]?: AIModel;
		[AIModality.Image]?: AIModel;
		[AIModality.Vision]?: AIModel;
		[AIModality.Embedding]?: AIModel;
	};
}

/**
 * Logging configuration
 */
export interface AILoggingConfig {
	enabled: boolean;
	logRequests?: boolean;
	logResponses?: boolean;
	logErrors?: boolean;
	logUsage?: boolean;
	redactApiKeys?: boolean;
}

/**
 * Cost tracking configuration
 */
export interface AICostTrackingConfig {
	enabled: boolean;
	currency?: 'USD' | 'EUR' | 'GBP';
	trackPerRequest?: boolean;
	alertThreshold?: number;
}

/**
 * Retry configuration
 */
export interface AIRetryConfig {
	maxRetries: number;
	initialDelayMs: number;
	maxDelayMs: number;
	backoffMultiplier: number;
	retryableErrors: string[];
}

/**
 * Global AI configuration
 */
export interface AIGlobalConfig {
	providers: AIProviderConfig;
	defaultProviders: AIDefaultProviders;
	defaultModels: AIDefaultModels;
	logging: AILoggingConfig;
	costTracking: AICostTrackingConfig;
	retry: AIRetryConfig;
	defaultTimeout: number;
}

/**
 * Request-level configuration override
 */
export interface AIRequestConfig {
	provider?: AIProvider;
	model?: AIModel | string;
	timeout?: number;
	maxRetries?: number;
	skipRetry?: boolean;
	skipLogging?: boolean;
	skipCostTracking?: boolean;
	metadata?: Record<string, unknown>;
}
