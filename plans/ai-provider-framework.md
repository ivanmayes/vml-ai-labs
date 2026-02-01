# AI Provider Framework for NestJS API

## Overview

Build a modular, reusable AI provider framework that allows applications to easily integrate with multiple AI providers (OpenAI, Anthropic, Google Gemini, Azure OpenAI) across different modalities (text, image, vision, audio, embeddings).

**Key Goals:**

- Unified interface that normalizes provider differences
- Easy provider/model swapping via config or per-request
- Multi-modality support with streaming
- Follow existing codebase patterns (static utility classes + injectable service orchestrator)

---

## Directory Structure

```
apps/api/src/
├── _core/third-party/ai/
│   ├── index.ts                    # Re-exports
│   ├── models/
│   │   ├── index.ts
│   │   ├── enums.ts                # AIProvider, AIModality, AIModel
│   │   ├── interfaces.ts           # Request/Response types
│   │   ├── config.ts               # Configuration types
│   │   └── errors.ts               # Custom error classes
│   ├── providers/
│   │   ├── index.ts
│   │   ├── openai/
│   │   │   ├── index.ts
│   │   │   └── openai.client.ts    # Static OpenAI class
│   │   ├── anthropic/
│   │   │   ├── index.ts
│   │   │   └── anthropic.client.ts
│   │   ├── google/
│   │   │   ├── index.ts
│   │   │   └── google.client.ts
│   │   └── azure-openai/
│   │       ├── index.ts
│   │       └── azure-openai.client.ts
│   └── utils/
│       ├── retry.ts                # Exponential backoff
│       └── cost-calculator.ts      # Usage cost estimation
├── ai/
│   ├── ai.module.ts                # Global NestJS module
│   ├── ai.service.ts               # Injectable orchestrator
│   └── ai.config.ts                # App-level configuration
```

---

## Implementation Tasks

### Phase 1: Core Models & Interfaces

**Files to create:**

1. `_core/third-party/ai/models/enums.ts`
   - `AIProvider` enum: `openai`, `anthropic`, `google`, `azure-openai`
   - `AIModality` enum: `text`, `image`, `vision`, `audio`, `embedding`, `video`
   - `AIModel` enum: GPT-4o, Claude 3.5, Gemini 1.5, etc.

2. `_core/third-party/ai/models/interfaces.ts`
   - `AIMessage`, `AIContentPart` - Message types with multimodal content
   - `AITextRequest/Response` - Text generation
   - `AIImageRequest/Response` - Image generation
   - `AIVisionRequest/Response` - Image understanding
   - `AIEmbeddingRequest/Response` - Vector embeddings
   - `AISpeechToTextRequest/Response`, `AITextToSpeechRequest/Response` - Audio
   - `AITool`, `AIToolCall` - Function calling support
   - `AIUsage` - Token/cost tracking

3. `_core/third-party/ai/models/errors.ts`
   - `AIError` base class
   - `AIProviderError`, `AIRateLimitError`, `AIAuthenticationError`
   - `AIModelNotSupportedError`, `AIContentFilterError`

4. `_core/third-party/ai/models/config.ts`
   - `AIProviderConfig` - Per-provider settings
   - `AIGlobalConfig` - Default providers, logging, cost tracking

### Phase 2: Provider Clients (Static Classes)

**Pattern to follow** (from `sendgrid.ts`):

```typescript
export class OpenAIClient {
  private static config = {
    apiKey: process.env.OPENAI_API_KEY,
    // ...
  };

  public static async generateText(
    request: AITextRequest,
    configOverride?: OpenAIConfig,
  ): Promise<AITextResponse> {
    const config = { ...this.config, ...(configOverride || {}) };
    // Implementation
  }
}
```

**Files to create:**

1. `providers/openai/openai.client.ts`
   - `generateText()`, `generateTextStream()` - Chat completions
   - `generateImage()` - DALL-E
   - `analyzeImage()` - Vision
   - `speechToText()`, `textToSpeech()` - Whisper/TTS
   - `generateEmbedding()` - Embeddings

2. `providers/anthropic/anthropic.client.ts`
   - `generateText()`, `generateTextStream()` - Claude messages
   - `analyzeImage()` - Claude vision

3. `providers/google/google.client.ts`
   - `generateText()`, `generateTextStream()` - Gemini
   - `analyzeImage()` - Gemini vision
   - `generateEmbedding()` - Text embeddings

4. `providers/azure-openai/azure-openai.client.ts`
   - Same methods as OpenAI, different auth/endpoints

### Phase 3: Utilities

1. `utils/retry.ts`
   - `RetryUtil.withRetry()` - Exponential backoff with jitter
   - Rate limit awareness (use `retry-after` header)

2. `utils/cost-calculator.ts`
   - Pricing table for each model
   - `calculateCost(provider, model, usage)` - Estimate cost

### Phase 4: Injectable Service

**File:** `ai/ai.service.ts`

**Pattern to follow** (from `notification.service.ts`):

```typescript
@Injectable()
export class AIService {
  async generateText(request: AITextRequest, config?: AIRequestConfig) {
    const provider = this.resolveProvider(request.provider, AIModality.Text);

    switch (provider) {
      case AIProvider.OpenAI:
        return OpenAIClient.generateText(request);
      case AIProvider.Anthropic:
        return AnthropicClient.generateText(request);
      // ...
    }
  }
}
```

**Methods:**

- `generateText()` / `generateTextStream()` - Text generation with streaming
- `generateImage()` - Image generation
- `analyzeImage()` - Vision/image understanding
- `speechToText()` / `textToSpeech()` - Audio
- `generateEmbedding()` - Vector embeddings
- `getProviderCapabilities()` - Query what each provider supports

**File:** `ai/ai.module.ts`

```typescript
@Global()
@Module({
  providers: [AIService],
  exports: [AIService],
})
export class AIModule {}
```

### Phase 5: Configuration

**Environment Variables:**

```bash
# Provider API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=...
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_RESOURCE_NAME=...
AZURE_OPENAI_DEPLOYMENT_ID=...

# Default Providers (per modality)
AI_DEFAULT_TEXT_PROVIDER=openai
AI_DEFAULT_IMAGE_PROVIDER=openai
AI_DEFAULT_VISION_PROVIDER=anthropic
AI_DEFAULT_AUDIO_PROVIDER=openai
AI_DEFAULT_EMBEDDING_PROVIDER=openai

# Optional Features
AI_COST_TRACKING_ENABLED=true
AI_LOGGING_ENABLED=true
```

**File:** `ai/ai.config.ts`

- Read env vars and build `AIGlobalConfig`

---

## NPM Dependencies to Add

```json
{
  "openai": "^4.77.0",
  "@anthropic-ai/sdk": "^0.32.0",
  "@google/generative-ai": "^0.21.0",
  "@azure/openai": "^1.0.0-beta.12"
}
```

---

## Example Usage

```typescript
// Basic text generation (uses default provider)
const response = await aiService.generateText({
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" },
  ],
});

// Specific provider/model
const response = await aiService.generateText({
  messages: [{ role: "user", content: "Hello!" }],
  provider: AIProvider.Anthropic,
  model: AIModel.Claude35Sonnet,
  maxTokens: 4096,
});

// Streaming
for await (const chunk of aiService.generateTextStream({ messages })) {
  process.stdout.write(chunk.content);
}

// Image analysis
const analysis = await aiService.analyzeImage({
  images: [{ base64: imageData, mimeType: "image/png" }],
  prompt: "Describe this image",
  provider: AIProvider.Google,
});
```

---

## Adding New Providers (Future)

1. Create `providers/new-provider/new-provider.client.ts` with static methods
2. Add to `AIProvider` enum
3. Add switch case in `AIService` methods
4. Add env vars for configuration

---

## Critical Files to Reference

- `apps/api/src/_core/third-party/sendgrid.ts` - Static class pattern
- `apps/api/src/notification/notification.service.ts:231-264` - Provider switching pattern
- `apps/api/src/notification/models/index.ts` - Provider enum pattern

---

## Verification Plan

1. **Unit Tests:**
   - Mock provider SDKs
   - Test provider routing logic
   - Test error handling and retries

2. **Integration Tests:**
   - Test each provider with real API calls (using test API keys)
   - Verify streaming works correctly
   - Test multimodal requests (vision, audio)

3. **Manual Verification:**
   - Create a simple endpoint to test text generation
   - Verify provider switching works via env var change
   - Test streaming response in a controller
