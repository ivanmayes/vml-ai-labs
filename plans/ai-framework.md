# AI Provider Framework for NestJS API

## Overview

Build a minimal, well-architected AI provider framework focused on text generation with proper rate limiting, testability, and extensibility.

**Goals:**

- Start simple: text generation only, add modalities when needed
- Testable: interfaces for mocking, not static classes
- Resilient: rate limiting, circuit breaker, fallback providers
- Extensible: registry pattern for easy provider addition

---

## Directory Structure (6 files)

```
apps/api/src/
├── _core/third-party/ai/
│   ├── index.ts                    # Re-exports
│   ├── ai.types.ts                 # All types in one file
│   ├── ai.openai.ts                # OpenAI client (implements interface)
│   ├── ai.anthropic.ts             # Anthropic client (implements interface)
│   └── ai.google.ts                # Google client (implements interface)
├── ai/
│   ├── ai.module.ts                # NestJS module with provider registration
│   └── ai.service.ts               # Orchestrator with registry pattern
```

---

## Phase 1: Core Types

**File:** `_core/third-party/ai/ai.types.ts`

```typescript
// === PROVIDERS (use strings, not enums - models change frequently) ===
export type AIProvider = "openai" | "anthropic" | "google";

// === MESSAGES ===
export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// === REQUEST ===
export interface AITextRequest {
  messages: AIMessage[];
  model?: string; // Provider validates, not us
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  requestId?: string; // For tracing/debugging
  abortSignal?: AbortSignal; // For cancellation
}

// === RESPONSE ===
export interface AITextResponse {
  content: string;
  model: string;
  provider: AIProvider;
  usage: AIUsage;
  finishReason: "stop" | "length" | "tool_calls" | "error";
  requestId?: string;
}

export interface AIStreamChunk {
  content: string;
  finishReason?: string;
}

export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
}

// === ERROR (single class, not hierarchy) ===
export class AIError extends Error {
  constructor(
    message: string,
    public readonly provider: AIProvider,
    public readonly code:
      | "rate_limit"
      | "auth"
      | "invalid_request"
      | "provider_error"
      | "timeout",
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "AIError";
  }
}

// === PROVIDER CLIENT INTERFACE (for testability) ===
export interface AIProviderClient {
  readonly provider: AIProvider;
  generateText(request: AITextRequest): Promise<AITextResponse>;
  generateTextStream(request: AITextRequest): AsyncGenerator<AIStreamChunk>;
  healthCheck(): Promise<boolean>;
}

// === CONFIGURATION ===
export interface AIProviderConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface AIServiceConfig {
  defaultProvider: AIProvider;
  providers: Partial<Record<AIProvider, AIProviderConfig>>;
  rateLimiting?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  fallbackProvider?: AIProvider;
  circuitBreaker?: {
    failureThreshold: number; // Failures before opening
    resetTimeoutMs: number; // Time before half-open
  };
}
```

---

## Phase 2: Provider Clients (Injectable, Not Static)

Each client implements `AIProviderClient` interface for testability.

**File:** `_core/third-party/ai/ai.openai.ts`

```typescript
import OpenAI from "openai";
import { Injectable } from "@nestjs/common";
import {
  AIProviderClient,
  AITextRequest,
  AITextResponse,
  AIStreamChunk,
  AIProviderConfig,
  AIError,
} from "./ai.types";

@Injectable()
export class OpenAIClient implements AIProviderClient {
  readonly provider = "openai" as const;
  private client: OpenAI;
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeout ?? 60000,
      maxRetries: config.maxRetries ?? 2,
    });
  }

  async generateText(request: AITextRequest): Promise<AITextResponse> {
    const startTime = Date.now();
    try {
      const response = await this.client.chat.completions.create(
        {
          model: request.model ?? "gpt-4o-mini",
          messages: request.messages,
          max_tokens: request.maxTokens,
          temperature: request.temperature,
        },
        {
          signal: request.abortSignal,
        },
      );

      return {
        content: response.choices[0]?.message?.content ?? "",
        model: response.model,
        provider: this.provider,
        finishReason: this.mapFinishReason(response.choices[0]?.finish_reason),
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
          latencyMs: Date.now() - startTime,
        },
        requestId: request.requestId,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async *generateTextStream(
    request: AITextRequest,
  ): AsyncGenerator<AIStreamChunk> {
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: request.model ?? "gpt-4o-mini",
          messages: request.messages,
          max_tokens: request.maxTokens,
          temperature: request.temperature,
          stream: true,
        },
        {
          signal: request.abortSignal,
        },
      );

      for await (const chunk of stream) {
        yield {
          content: chunk.choices[0]?.delta?.content ?? "",
          finishReason: chunk.choices[0]?.finish_reason ?? undefined,
        };
      }
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  private mapFinishReason(reason?: string): AITextResponse["finishReason"] {
    if (reason === "stop") return "stop";
    if (reason === "length") return "length";
    if (reason === "tool_calls") return "tool_calls";
    return "stop";
  }

  private mapError(error: unknown): AIError {
    if (error instanceof OpenAI.APIError) {
      if (error.status === 429) {
        const retryAfter = parseInt(error.headers?.["retry-after"] ?? "60", 10);
        return new AIError(
          "Rate limit exceeded",
          this.provider,
          "rate_limit",
          429,
          true,
          retryAfter * 1000,
        );
      }
      if (error.status === 401) {
        return new AIError("Authentication failed", this.provider, "auth", 401);
      }
      return new AIError(
        error.message,
        this.provider,
        "provider_error",
        error.status,
      );
    }
    return new AIError(
      error instanceof Error ? error.message : "Unknown error",
      this.provider,
      "provider_error",
    );
  }
}
```

**Similar implementations for `ai.anthropic.ts` and `ai.google.ts`**

---

## Phase 3: AI Service with Registry Pattern & Circuit Breaker

**File:** `ai/ai.service.ts`

```typescript
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  AIProvider,
  AIProviderClient,
  AITextRequest,
  AITextResponse,
  AIStreamChunk,
  AIServiceConfig,
  AIError,
} from "../_core/third-party/ai";

interface CircuitState {
  failures: number;
  lastFailure: number;
  state: "closed" | "open" | "half-open";
}

interface RateLimitState {
  requestCount: number;
  tokenCount: number;
  windowStart: number;
}

@Injectable()
export class AIService implements OnModuleInit {
  private readonly logger = new Logger(AIService.name);
  private readonly providers = new Map<AIProvider, AIProviderClient>();
  private readonly circuits = new Map<AIProvider, CircuitState>();
  private readonly rateLimits = new Map<AIProvider, RateLimitState>();
  private config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = config;
  }

  // === PROVIDER REGISTRATION (registry pattern) ===

  registerProvider(client: AIProviderClient): void {
    this.providers.set(client.provider, client);
    this.circuits.set(client.provider, {
      failures: 0,
      lastFailure: 0,
      state: "closed",
    });
    this.rateLimits.set(client.provider, {
      requestCount: 0,
      tokenCount: 0,
      windowStart: Date.now(),
    });
    this.logger.log(`Registered AI provider: ${client.provider}`);
  }

  async onModuleInit(): Promise<void> {
    // Health check all registered providers
    for (const [provider, client] of this.providers) {
      const healthy = await client.healthCheck();
      this.logger.log(
        `Provider ${provider} health: ${healthy ? "OK" : "FAILED"}`,
      );
    }
  }

  // === MAIN API ===

  async generateText(
    request: AITextRequest,
    provider?: AIProvider,
  ): Promise<AITextResponse> {
    const targetProvider = provider ?? this.config.defaultProvider;

    // Check circuit breaker
    if (!this.isCircuitClosed(targetProvider)) {
      if (
        this.config.fallbackProvider &&
        this.isCircuitClosed(this.config.fallbackProvider)
      ) {
        this.logger.warn(
          `Circuit open for ${targetProvider}, falling back to ${this.config.fallbackProvider}`,
        );
        return this.executeWithProvider(this.config.fallbackProvider, request);
      }
      throw new AIError(
        `Provider ${targetProvider} is unavailable`,
        targetProvider,
        "provider_error",
      );
    }

    // Check rate limit
    this.checkRateLimit(targetProvider);

    return this.executeWithProvider(targetProvider, request);
  }

  async *generateTextStream(
    request: AITextRequest,
    provider?: AIProvider,
  ): AsyncGenerator<AIStreamChunk> {
    const targetProvider = provider ?? this.config.defaultProvider;
    const client = this.getClient(targetProvider);

    this.checkRateLimit(targetProvider);

    try {
      for await (const chunk of client.generateTextStream(request)) {
        yield chunk;
      }
      this.recordSuccess(targetProvider);
    } catch (error) {
      this.recordFailure(targetProvider);
      throw error;
    }
  }

  // === CIRCUIT BREAKER ===

  private isCircuitClosed(provider: AIProvider): boolean {
    const circuit = this.circuits.get(provider);
    if (!circuit || !this.config.circuitBreaker) return true;

    if (circuit.state === "open") {
      const elapsed = Date.now() - circuit.lastFailure;
      if (elapsed > this.config.circuitBreaker.resetTimeoutMs) {
        circuit.state = "half-open";
        return true;
      }
      return false;
    }
    return true;
  }

  private recordSuccess(provider: AIProvider): void {
    const circuit = this.circuits.get(provider);
    if (circuit) {
      circuit.failures = 0;
      circuit.state = "closed";
    }
  }

  private recordFailure(provider: AIProvider): void {
    const circuit = this.circuits.get(provider);
    if (circuit && this.config.circuitBreaker) {
      circuit.failures++;
      circuit.lastFailure = Date.now();
      if (circuit.failures >= this.config.circuitBreaker.failureThreshold) {
        circuit.state = "open";
        this.logger.warn(`Circuit opened for provider: ${provider}`);
      }
    }
  }

  // === RATE LIMITING ===

  private checkRateLimit(provider: AIProvider): void {
    if (!this.config.rateLimiting) return;

    const state = this.rateLimits.get(provider);
    if (!state) return;

    const now = Date.now();
    const windowMs = 60000; // 1 minute window

    // Reset window if expired
    if (now - state.windowStart > windowMs) {
      state.requestCount = 0;
      state.tokenCount = 0;
      state.windowStart = now;
    }

    if (state.requestCount >= this.config.rateLimiting.requestsPerMinute) {
      const retryAfter = windowMs - (now - state.windowStart);
      throw new AIError(
        "Rate limit exceeded",
        provider,
        "rate_limit",
        429,
        true,
        retryAfter,
      );
    }

    state.requestCount++;
  }

  // === HELPERS ===

  private getClient(provider: AIProvider): AIProviderClient {
    const client = this.providers.get(provider);
    if (!client) {
      throw new AIError(
        `Provider ${provider} not registered`,
        provider,
        "provider_error",
      );
    }
    return client;
  }

  private async executeWithProvider(
    provider: AIProvider,
    request: AITextRequest,
  ): Promise<AITextResponse> {
    const client = this.getClient(provider);
    try {
      const response = await client.generateText(request);
      this.recordSuccess(provider);
      return response;
    } catch (error) {
      this.recordFailure(provider);
      throw error;
    }
  }
}
```

---

## Phase 4: NestJS Module with DI

**File:** `ai/ai.module.ts`

```typescript
import { Module, Global, DynamicModule } from "@nestjs/common";
import { AIService } from "./ai.service";
import { OpenAIClient } from "../_core/third-party/ai/ai.openai";
import { AnthropicClient } from "../_core/third-party/ai/ai.anthropic";
import { GoogleAIClient } from "../_core/third-party/ai/ai.google";
import { AIServiceConfig } from "../_core/third-party/ai";

@Global()
@Module({})
export class AIModule {
  static forRoot(config: AIServiceConfig): DynamicModule {
    return {
      module: AIModule,
      providers: [
        {
          provide: AIService,
          useFactory: () => {
            const service = new AIService(config);

            // Register configured providers
            if (config.providers.openai) {
              service.registerProvider(
                new OpenAIClient(config.providers.openai),
              );
            }
            if (config.providers.anthropic) {
              service.registerProvider(
                new AnthropicClient(config.providers.anthropic),
              );
            }
            if (config.providers.google) {
              service.registerProvider(
                new GoogleAIClient(config.providers.google),
              );
            }

            return service;
          },
        },
      ],
      exports: [AIService],
    };
  }
}
```

**Usage in `app.module.ts`:**

```typescript
AIModule.forRoot({
  defaultProvider: 'openai',
  providers: {
    openai: { apiKey: process.env.OPENAI_API_KEY },
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
  },
  rateLimiting: {
    requestsPerMinute: 60,
    tokensPerMinute: 100000,
  },
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
  },
  fallbackProvider: 'anthropic',
}),
```

---

## Environment Variables (Minimal)

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=...

# Optional
AI_DEFAULT_PROVIDER=openai
AI_RATE_LIMIT_RPM=60
```

---

## NPM Dependencies

```json
{
  "openai": "^4.77.0",
  "@anthropic-ai/sdk": "^0.32.0",
  "@google/generative-ai": "^0.21.0"
}
```

---

## Testing Strategy

Since clients implement `AIProviderClient` interface, mocking is straightforward:

```typescript
// Create mock client
const mockClient: AIProviderClient = {
  provider: 'openai',
  generateText: jest.fn().mockResolvedValue({ content: 'Hello!' }),
  generateTextStream: jest.fn(),
  healthCheck: jest.fn().mockResolvedValue(true),
};

// Register mock
aiService.registerProvider(mockClient);

// Test
const result = await aiService.generateText({ messages: [...] });
expect(mockClient.generateText).toHaveBeenCalled();
```

---

## Example Usage

```typescript
@Injectable()
export class ChatService {
  constructor(private readonly ai: AIService) {}

  async chat(message: string): Promise<string> {
    const response = await this.ai.generateText({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: message },
      ],
      requestId: uuid(),
    });
    return response.content;
  }

  // Use specific provider
  async chatWithClaude(message: string): Promise<string> {
    const response = await this.ai.generateText(
      { messages: [{ role: "user", content: message }] },
      "anthropic",
    );
    return response.content;
  }

  // Streaming
  async *streamChat(message: string): AsyncGenerator<string> {
    const stream = this.ai.generateTextStream({
      messages: [{ role: "user", content: message }],
    });
    for await (const chunk of stream) {
      yield chunk.content;
    }
  }
}
```

---

## Future Additions (When Needed)

Add these only when there's a real use case:

1. **Image generation** - Add `generateImage()` method and new client methods
2. **Vision** - Add multimodal message content type
3. **Embeddings** - Add `generateEmbedding()` method
4. **Cost tracking** - Add usage callback in config
5. **Caching** - Add cache layer for identical requests

---

## Verification Plan

1. **Unit tests**: Mock provider clients, test rate limiting, circuit breaker logic
2. **Integration tests**: Real API calls with test keys (skip in CI without keys)
3. **Manual verification**: Create `/ai/test` endpoint, verify streaming in browser
