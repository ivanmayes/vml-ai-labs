/**
 * AI Module - Re-exports
 *
 * Mini apps consume AI capabilities exclusively through this module
 * boundary (the lint rule blocks deep imports into `_core/third-party/ai`).
 * Re-export the error classes + the response interface so callers can
 * narrow on provider failures without reaching past the module.
 */

export { AIModule } from './ai.module';
export { AIService } from './ai.service';
export { AIConfig, buildAIConfig } from './ai.config';
export {
	AIError,
	AIProviderError,
	AIRateLimitError,
	AITimeoutError,
	AIAuthenticationError,
	AIContentFilterError,
	AIModelNotSupportedError,
	AIValidationError,
	AIConfigurationError,
} from '../_core/third-party/ai/models/errors';
export type { AIVisionResponse } from '../_core/third-party/ai/models/interfaces';
