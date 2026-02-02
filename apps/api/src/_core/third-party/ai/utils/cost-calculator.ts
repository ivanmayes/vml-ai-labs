/**
 * Cost Calculator
 * Estimate costs for AI API usage
 */

import { AIProvider, AIModel } from '../models/enums';
import type { AIUsage } from '../models/interfaces';

/**
 * Pricing per 1K tokens (in USD)
 * Updated as of December 2024 - prices may change
 */
interface ModelPricing {
	inputPer1K: number;
	outputPer1K: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
	// OpenAI Models
	[AIModel.GPT4o]: { inputPer1K: 0.0025, outputPer1K: 0.01 },
	[AIModel.GPT4oMini]: { inputPer1K: 0.00015, outputPer1K: 0.0006 },
	[AIModel.GPT4Turbo]: { inputPer1K: 0.01, outputPer1K: 0.03 },
	[AIModel.GPT4]: { inputPer1K: 0.03, outputPer1K: 0.06 },
	[AIModel.GPT35Turbo]: { inputPer1K: 0.0005, outputPer1K: 0.0015 },
	[AIModel.O1]: { inputPer1K: 0.015, outputPer1K: 0.06 },
	[AIModel.O1Mini]: { inputPer1K: 0.003, outputPer1K: 0.012 },
	[AIModel.O1Preview]: { inputPer1K: 0.015, outputPer1K: 0.06 },
	[AIModel.TextEmbedding3Large]: { inputPer1K: 0.00013, outputPer1K: 0 },
	[AIModel.TextEmbedding3Small]: { inputPer1K: 0.00002, outputPer1K: 0 },
	[AIModel.TextEmbeddingAda002]: { inputPer1K: 0.0001, outputPer1K: 0 },
	[AIModel.Whisper1]: { inputPer1K: 0.006, outputPer1K: 0 }, // Per minute, not tokens
	[AIModel.TTS1]: { inputPer1K: 0.015, outputPer1K: 0 }, // Per 1K characters
	[AIModel.TTS1HD]: { inputPer1K: 0.03, outputPer1K: 0 }, // Per 1K characters

	// Anthropic Models
	[AIModel.Claude35Sonnet]: { inputPer1K: 0.003, outputPer1K: 0.015 },
	[AIModel.Claude35Haiku]: { inputPer1K: 0.001, outputPer1K: 0.005 },
	[AIModel.Claude3Opus]: { inputPer1K: 0.015, outputPer1K: 0.075 },
	[AIModel.Claude3Sonnet]: { inputPer1K: 0.003, outputPer1K: 0.015 },
	[AIModel.Claude3Haiku]: { inputPer1K: 0.00025, outputPer1K: 0.00125 },

	// Google Gemini Models
	[AIModel.Gemini15Pro]: { inputPer1K: 0.00125, outputPer1K: 0.005 },
	[AIModel.Gemini15Flash]: { inputPer1K: 0.000075, outputPer1K: 0.0003 },
	[AIModel.Gemini15Flash8B]: { inputPer1K: 0.0000375, outputPer1K: 0.00015 },
	[AIModel.Gemini10Pro]: { inputPer1K: 0.0005, outputPer1K: 0.0015 },
	[AIModel.TextEmbedding004]: { inputPer1K: 0.000025, outputPer1K: 0 },
	[AIModel.Embedding001]: { inputPer1K: 0.000025, outputPer1K: 0 },

	// Amazon Bedrock Models (prices per 1K tokens)
	[AIModel.BedrockClaude35Sonnet]: { inputPer1K: 0.003, outputPer1K: 0.015 },
	[AIModel.BedrockClaude35Haiku]: { inputPer1K: 0.0008, outputPer1K: 0.004 },
	[AIModel.BedrockClaude3Opus]: { inputPer1K: 0.015, outputPer1K: 0.075 },
	[AIModel.BedrockClaude3Sonnet]: { inputPer1K: 0.003, outputPer1K: 0.015 },
	[AIModel.BedrockClaude3Haiku]: {
		inputPer1K: 0.00025,
		outputPer1K: 0.00125,
	},
	[AIModel.BedrockLlama370B]: { inputPer1K: 0.00265, outputPer1K: 0.0035 },
	[AIModel.BedrockLlama38B]: { inputPer1K: 0.0003, outputPer1K: 0.0006 },
	[AIModel.BedrockMistralLarge]: { inputPer1K: 0.004, outputPer1K: 0.012 },
	[AIModel.BedrockMistral7B]: { inputPer1K: 0.00015, outputPer1K: 0.0002 },
	[AIModel.BedrockTitanTextPremier]: {
		inputPer1K: 0.0005,
		outputPer1K: 0.0015,
	},
	[AIModel.BedrockTitanTextExpress]: {
		inputPer1K: 0.0002,
		outputPer1K: 0.0006,
	},
	[AIModel.BedrockTitanEmbedV2]: { inputPer1K: 0.00002, outputPer1K: 0 },
	[AIModel.BedrockTitanEmbedV1]: { inputPer1K: 0.0001, outputPer1K: 0 },
};

/**
 * Image generation pricing (per image)
 */
interface ImagePricing {
	standard: Record<string, number>;
	hd: Record<string, number>;
}

const IMAGE_PRICING: Record<string, ImagePricing> = {
	[AIModel.DALLE3]: {
		standard: {
			'1024x1024': 0.04,
			'1024x1792': 0.08,
			'1792x1024': 0.08,
		},
		hd: {
			'1024x1024': 0.08,
			'1024x1792': 0.12,
			'1792x1024': 0.12,
		},
	},
	[AIModel.DALLE2]: {
		standard: {
			'256x256': 0.016,
			'512x512': 0.018,
			'1024x1024': 0.02,
		},
		hd: {
			'256x256': 0.016,
			'512x512': 0.018,
			'1024x1024': 0.02,
		},
	},
};

/**
 * Cost calculation result
 */
export interface CostEstimate {
	inputCost: number;
	outputCost: number;
	totalCost: number;
	currency: string;
	model: string;
	provider: AIProvider;
}

/**
 * Cost calculator utility
 */
export class CostCalculator {
	/**
	 * Calculate cost for text generation
	 */
	public static calculateTextCost(
		provider: AIProvider,
		model: string,
		usage: AIUsage,
	): CostEstimate {
		const pricing = MODEL_PRICING[model];

		if (!pricing) {
			return {
				inputCost: 0,
				outputCost: 0,
				totalCost: 0,
				currency: 'USD',
				model,
				provider,
			};
		}

		const inputCost = (usage.promptTokens / 1000) * pricing.inputPer1K;
		const outputCost =
			(usage.completionTokens / 1000) * pricing.outputPer1K;

		return {
			inputCost,
			outputCost,
			totalCost: inputCost + outputCost,
			currency: 'USD',
			model,
			provider,
		};
	}

	/**
	 * Calculate cost for image generation
	 */
	public static calculateImageCost(
		provider: AIProvider,
		model: string,
		size: string,
		quality: 'standard' | 'hd',
		count: number,
	): CostEstimate {
		const pricing = IMAGE_PRICING[model];

		if (!pricing) {
			return {
				inputCost: 0,
				outputCost: 0,
				totalCost: 0,
				currency: 'USD',
				model,
				provider,
			};
		}

		const pricePerImage = pricing[quality]?.[size] ?? 0;
		const totalCost = pricePerImage * count;

		return {
			inputCost: 0,
			outputCost: totalCost,
			totalCost,
			currency: 'USD',
			model,
			provider,
		};
	}

	/**
	 * Calculate cost for embeddings
	 */
	public static calculateEmbeddingCost(
		provider: AIProvider,
		model: string,
		tokenCount: number,
	): CostEstimate {
		const pricing = MODEL_PRICING[model];

		if (!pricing) {
			return {
				inputCost: 0,
				outputCost: 0,
				totalCost: 0,
				currency: 'USD',
				model,
				provider,
			};
		}

		const inputCost = (tokenCount / 1000) * pricing.inputPer1K;

		return {
			inputCost,
			outputCost: 0,
			totalCost: inputCost,
			currency: 'USD',
			model,
			provider,
		};
	}

	/**
	 * Calculate cost for speech-to-text (Whisper)
	 * Note: Whisper pricing is per minute, not tokens
	 */
	public static calculateSpeechToTextCost(
		provider: AIProvider,
		model: string,
		durationSeconds: number,
	): CostEstimate {
		// Whisper charges $0.006 per minute
		const pricePerMinute = 0.006;
		const minutes = durationSeconds / 60;
		const totalCost = minutes * pricePerMinute;

		return {
			inputCost: totalCost,
			outputCost: 0,
			totalCost,
			currency: 'USD',
			model,
			provider,
		};
	}

	/**
	 * Calculate cost for text-to-speech (TTS)
	 * Note: TTS pricing is per 1K characters
	 */
	public static calculateTextToSpeechCost(
		provider: AIProvider,
		model: string,
		characterCount: number,
	): CostEstimate {
		const pricing = MODEL_PRICING[model];

		if (!pricing) {
			return {
				inputCost: 0,
				outputCost: 0,
				totalCost: 0,
				currency: 'USD',
				model,
				provider,
			};
		}

		const inputCost = (characterCount / 1000) * pricing.inputPer1K;

		return {
			inputCost,
			outputCost: 0,
			totalCost: inputCost,
			currency: 'USD',
			model,
			provider,
		};
	}

	/**
	 * Get pricing for a model
	 */
	public static getModelPricing(model: string): ModelPricing | null {
		return MODEL_PRICING[model] ?? null;
	}

	/**
	 * Get pricing for image generation
	 */
	public static getImagePricing(model: string): ImagePricing | null {
		return IMAGE_PRICING[model] ?? null;
	}

	/**
	 * Format cost as currency string
	 */
	public static formatCost(cost: number, currency = 'USD'): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency,
			minimumFractionDigits: 6,
			maximumFractionDigits: 6,
		}).format(cost);
	}
}
