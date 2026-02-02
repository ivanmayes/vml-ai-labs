/**
 * AI Provider Enums
 * Defines all supported providers, modalities, and models
 */

/**
 * Supported AI providers
 */
export enum AIProvider {
	OpenAI = 'openai',
	Anthropic = 'anthropic',
	Google = 'google',
	AzureOpenAI = 'azure-openai',
	Bedrock = 'bedrock',
}

/**
 * Supported AI modalities
 */
export enum AIModality {
	Text = 'text',
	Image = 'image',
	Vision = 'vision',
	Audio = 'audio',
	Embedding = 'embedding',
	Video = 'video',
}

/**
 * Supported AI models
 */
export enum AIModel {
	// OpenAI Models
	GPT4o = 'gpt-4o',
	GPT4oMini = 'gpt-4o-mini',
	GPT4Turbo = 'gpt-4-turbo',
	GPT4 = 'gpt-4',
	GPT35Turbo = 'gpt-3.5-turbo',
	O1 = 'o1',
	O1Mini = 'o1-mini',
	O1Preview = 'o1-preview',
	DALLE3 = 'dall-e-3',
	DALLE2 = 'dall-e-2',
	Whisper1 = 'whisper-1',
	TTS1 = 'tts-1',
	TTS1HD = 'tts-1-hd',
	TextEmbedding3Large = 'text-embedding-3-large',
	TextEmbedding3Small = 'text-embedding-3-small',
	TextEmbeddingAda002 = 'text-embedding-ada-002',

	// Anthropic Models
	Claude35Sonnet = 'claude-3-5-sonnet-20241022',
	Claude35Haiku = 'claude-3-5-haiku-20241022',
	Claude3Opus = 'claude-3-opus-20240229',
	Claude3Sonnet = 'claude-3-sonnet-20240229',
	Claude3Haiku = 'claude-3-haiku-20240307',

	// Google Gemini Models
	Gemini15Pro = 'gemini-1.5-pro',
	Gemini15Flash = 'gemini-1.5-flash',
	Gemini15Flash8B = 'gemini-1.5-flash-8b',
	Gemini10Pro = 'gemini-1.0-pro',
	GeminiProVision = 'gemini-pro-vision',
	TextEmbedding004 = 'text-embedding-004',
	Embedding001 = 'embedding-001',

	// Amazon Bedrock Models
	BedrockClaude35Sonnet = 'anthropic.claude-3-5-sonnet-20241022-v2:0',
	BedrockClaude35Haiku = 'anthropic.claude-3-5-haiku-20241022-v1:0',
	BedrockClaude3Opus = 'anthropic.claude-3-opus-20240229-v1:0',
	BedrockClaude3Sonnet = 'anthropic.claude-3-sonnet-20240229-v1:0',
	BedrockClaude3Haiku = 'anthropic.claude-3-haiku-20240307-v1:0',
	BedrockLlama370B = 'meta.llama3-70b-instruct-v1:0',
	BedrockLlama38B = 'meta.llama3-8b-instruct-v1:0',
	BedrockMistralLarge = 'mistral.mistral-large-2407-v1:0',
	BedrockMistral7B = 'mistral.mistral-7b-instruct-v0:2',
	BedrockTitanTextPremier = 'amazon.titan-text-premier-v1:0',
	BedrockTitanTextExpress = 'amazon.titan-text-express-v1',
	BedrockTitanEmbedV2 = 'amazon.titan-embed-text-v2:0',
	BedrockTitanEmbedV1 = 'amazon.titan-embed-text-v1',
	BedrockTitanImage = 'amazon.titan-image-generator-v2:0',
}

/**
 * Message roles for chat completions
 */
export enum AIMessageRole {
	System = 'system',
	User = 'user',
	Assistant = 'assistant',
	Tool = 'tool',
}

/**
 * Image sizes for generation
 */
export enum AIImageSize {
	Small = '256x256',
	Medium = '512x512',
	Large = '1024x1024',
	Landscape = '1792x1024',
	Portrait = '1024x1792',
}

/**
 * Image quality for generation
 */
export enum AIImageQuality {
	Standard = 'standard',
	HD = 'hd',
}

/**
 * Image style for generation
 */
export enum AIImageStyle {
	Vivid = 'vivid',
	Natural = 'natural',
}

/**
 * Audio response formats
 */
export enum AIAudioFormat {
	MP3 = 'mp3',
	Opus = 'opus',
	AAC = 'aac',
	FLAC = 'flac',
	WAV = 'wav',
	PCM = 'pcm',
}

/**
 * TTS voice options
 */
export enum AIVoice {
	Alloy = 'alloy',
	Echo = 'echo',
	Fable = 'fable',
	Onyx = 'onyx',
	Nova = 'nova',
	Shimmer = 'shimmer',
}

/**
 * Finish reasons for completions
 */
export enum AIFinishReason {
	Stop = 'stop',
	Length = 'length',
	ContentFilter = 'content_filter',
	ToolCalls = 'tool_calls',
	Error = 'error',
}
