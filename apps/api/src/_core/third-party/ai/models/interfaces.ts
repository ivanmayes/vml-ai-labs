/**
 * AI Provider Interfaces
 * Defines request/response types for all AI operations
 */

import {
	AIProvider,
	AIModel,
	AIMessageRole,
	AIImageSize,
	AIImageQuality,
	AIImageStyle,
	AIAudioFormat,
	AIVoice,
	AIFinishReason,
} from './enums';

// ============================================================================
// Base Types
// ============================================================================

/**
 * Content part for multimodal messages
 */
export interface AIContentPart {
	type: 'text' | 'image' | 'audio';
	text?: string;
	image?: {
		url?: string;
		base64?: string;
		mimeType?: string;
		detail?: 'low' | 'high' | 'auto';
	};
	audio?: {
		url?: string;
		base64?: string;
		mimeType?: string;
	};
}

/**
 * Chat message with multimodal support
 */
export interface AIMessage {
	role: AIMessageRole;
	content: string | AIContentPart[];
	name?: string;
	toolCallId?: string;
	toolCalls?: AIToolCall[];
}

/**
 * Tool definition for function calling
 */
export interface AITool {
	type: 'function';
	function: {
		name: string;
		description?: string;
		parameters?: Record<string, unknown>;
		strict?: boolean;
	};
}

/**
 * Tool call made by the model
 */
export interface AIToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

/**
 * Token and cost usage tracking
 */
export interface AIUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	estimatedCost?: number;
}

/**
 * Base request configuration shared by all requests
 */
export interface AIBaseRequest {
	provider?: AIProvider;
	model?: AIModel | string;
	timeout?: number;
	maxRetries?: number;
}

/**
 * Base response shared by all responses
 */
export interface AIBaseResponse {
	provider: AIProvider;
	model: string;
	usage?: AIUsage;
	requestId?: string;
}

// ============================================================================
// Text Generation
// ============================================================================

/**
 * Text generation request
 */
export interface AITextRequest extends AIBaseRequest {
	messages: AIMessage[];
	maxTokens?: number;
	temperature?: number;
	topP?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	stop?: string | string[];
	tools?: AITool[];
	toolChoice?:
		| 'auto'
		| 'none'
		| 'required'
		| { type: 'function'; function: { name: string } };
	responseFormat?: { type: 'text' | 'json_object' };
	seed?: number;
	user?: string;
}

/**
 * Text generation response
 */
export interface AITextResponse extends AIBaseResponse {
	content: string;
	finishReason: AIFinishReason;
	toolCalls?: AIToolCall[];
}

/**
 * Streaming text chunk
 */
export interface AITextStreamChunk {
	content: string;
	finishReason?: AIFinishReason;
	toolCalls?: Partial<AIToolCall>[];
	usage?: AIUsage;
}

// ============================================================================
// Image Generation
// ============================================================================

/**
 * Image generation request
 */
export interface AIImageRequest extends AIBaseRequest {
	prompt: string;
	n?: number;
	size?: AIImageSize;
	quality?: AIImageQuality;
	style?: AIImageStyle;
	responseFormat?: 'url' | 'b64_json';
	user?: string;
}

/**
 * Generated image data
 */
export interface AIGeneratedImage {
	url?: string;
	base64?: string;
	revisedPrompt?: string;
}

/**
 * Image generation response
 */
export interface AIImageResponse extends AIBaseResponse {
	images: AIGeneratedImage[];
}

// ============================================================================
// Vision / Image Understanding
// ============================================================================

/**
 * Image input for vision analysis
 */
export interface AIImageInput {
	url?: string;
	base64?: string;
	mimeType?: string;
	detail?: 'low' | 'high' | 'auto';
}

/**
 * Vision analysis request
 */
export interface AIVisionRequest extends AIBaseRequest {
	images: AIImageInput[];
	prompt: string;
	maxTokens?: number;
	temperature?: number;
}

/**
 * Vision analysis response
 */
export interface AIVisionResponse extends AIBaseResponse {
	content: string;
	finishReason: AIFinishReason;
}

// ============================================================================
// Audio - Speech to Text
// ============================================================================

/**
 * Speech to text request
 */
export interface AISpeechToTextRequest extends AIBaseRequest {
	audio: {
		file?: Buffer;
		url?: string;
		base64?: string;
		mimeType?: string;
	};
	language?: string;
	prompt?: string;
	responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
	temperature?: number;
	timestampGranularities?: ('word' | 'segment')[];
}

/**
 * Speech to text response
 */
export interface AISpeechToTextResponse extends AIBaseResponse {
	text: string;
	language?: string;
	duration?: number;
	words?: {
		word: string;
		start: number;
		end: number;
	}[];
	segments?: {
		id: number;
		start: number;
		end: number;
		text: string;
	}[];
}

// ============================================================================
// Audio - Text to Speech
// ============================================================================

/**
 * Text to speech request
 */
export interface AITextToSpeechRequest extends AIBaseRequest {
	text: string;
	voice?: AIVoice;
	speed?: number;
	responseFormat?: AIAudioFormat;
}

/**
 * Text to speech response
 */
export interface AITextToSpeechResponse extends AIBaseResponse {
	audio: Buffer;
	format: AIAudioFormat;
	contentType: string;
}

// ============================================================================
// Embeddings
// ============================================================================

/**
 * Embedding generation request
 */
export interface AIEmbeddingRequest extends AIBaseRequest {
	input: string | string[];
	dimensions?: number;
	encodingFormat?: 'float' | 'base64';
	user?: string;
}

/**
 * Embedding generation response
 */
export interface AIEmbeddingResponse extends AIBaseResponse {
	embeddings: number[][];
	dimensions: number;
}

// ============================================================================
// Streaming Types
// ============================================================================

/**
 * Async generator type for streaming responses
 */
export type AITextStream = AsyncGenerator<AITextStreamChunk, void, unknown>;

// ============================================================================
// Provider Capabilities
// ============================================================================

/**
 * Capabilities supported by a provider
 */
export interface AIProviderCapabilities {
	provider: AIProvider;
	textGeneration: boolean;
	streaming: boolean;
	imageGeneration: boolean;
	vision: boolean;
	speechToText: boolean;
	textToSpeech: boolean;
	embeddings: boolean;
	functionCalling: boolean;
	jsonMode: boolean;
	models: {
		text?: AIModel[];
		image?: AIModel[];
		vision?: AIModel[];
		audio?: AIModel[];
		embedding?: AIModel[];
	};
}
