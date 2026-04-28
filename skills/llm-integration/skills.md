# LLM Integration Skill

## Overview

The LLM Integration skill covers how Agent Replay intercepts, records, and replays calls to Large Language Model providers. This is the most critical integration surface in the project — every feature depends on correctly capturing LLM interactions.

## Supported Providers

### Tier 1 (MVP)

- **OpenAI** (GPT-4, GPT-4o, GPT-3.5-turbo) — chat completions, streaming, function calling
- **Anthropic** (Claude 3.5 Sonnet, Claude 3 Opus) — messages API, streaming, tool use
- **Azure OpenAI** — OpenAI-compatible API with Azure-specific auth

### Tier 2 (Post-MVP)

- **Google Gemini** — generative language API
- **Cohere** — command models
- **Mistral** — La Plateforme API
- **Local / Open Source** — Ollama, vLLM, llama.cpp via OpenAI-compatible endpoints

## Core Abstractions

### Provider-Agnostic Request/Response

```typescript
interface LLMRequest {
  provider: string;
  model: string;
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  // Provider-specific extras are preserved in `raw` for fidelity
  raw: Record<string, unknown>;
}

interface LLMResponse {
  id: string;
  model: string;
  content: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  finishReason: string;
  // Provider-specific extras
  raw: Record<string, unknown>;
}

interface StreamingLLMResponse {
  chunks: AsyncIterable<StreamChunk>;
  aggregated: Promise<LLMResponse>;
}
```

### Provider Adapter Pattern

```typescript
interface LLMProviderAdapter {
  readonly provider: string;

  // Normalize provider-native request to our canonical format
  normalizeRequest(nativeRequest: unknown): LLMRequest;

  // Normalize provider-native response to our canonical format
  normalizeResponse(nativeResponse: unknown): LLMResponse;

  // Normalize a stream chunk
  normalizeChunk(nativeChunk: unknown): StreamChunk;

  // Reconstruct a native request from our canonical format (for live replay)
  denormalizeRequest(request: LLMRequest): unknown;
}

class OpenAIAdapter implements LLMProviderAdapter {
  readonly provider = 'openai';

  normalizeRequest(native: OpenAI.Chat.ChatCompletionCreateParams): LLMRequest {
    return {
      provider: 'openai',
      model: native.model,
      messages: native.messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
      tools: native.tools?.map(t => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
      temperature: native.temperature,
      maxTokens: native.max_tokens,
      raw: native,
    };
  }

  normalizeChunk(native: OpenAI.Chat.Completions.ChatCompletionChunk): StreamChunk {
    const delta = native.choices[0]?.delta;
    return {
      index: native.choices[0]?.index ?? 0,
      delta: delta?.content ?? '',
      toolCallDelta: delta?.tool_calls?.[0],
      finishReason: native.choices[0]?.finish_reason,
    };
  }
}
```

## Streaming Response Handling

### Recording Streams

```typescript
class StreamingRecorder {
  private chunks: StreamChunk[] = [];
  private aggregatedContent = '';
  private aggregatedToolCalls: ToolCall[] = [];

  async recordStream(
    nativeStream: AsyncIterable<unknown>,
    adapter: LLMProviderAdapter
  ): Promise<RecordedStream> {
    for await (const nativeChunk of nativeStream) {
      const chunk = adapter.normalizeChunk(nativeChunk);
      this.chunks.push(chunk);

      // Aggregate content incrementally
      if (chunk.delta) {
        this.aggregatedContent += chunk.delta;
      }

      // Aggregate tool calls incrementally
      if (chunk.toolCallDelta) {
        this.aggregateToolCallDelta(chunk.toolCallDelta);
      }

      // Yield the chunk so the agent still receives it in real time
      yield nativeChunk;
    }

    return {
      chunks: this.chunks,
      aggregatedContent: this.aggregatedContent,
      aggregatedToolCalls: this.aggregatedToolCalls,
      duration: 0, // filled by caller
      totalChunks: this.chunks.length,
    };
  }
}
```

**Key decisions:**

- We record chunks AND pre-compute aggregates. This lets stubbed replay yield chunks for streaming consumers, while diff mode compares the aggregate.
- The recording interceptor is a "tee": it passes chunks through to the agent while saving them.
- Tool call deltas are assembled into complete tool calls during recording.

### Replaying Streams

```typescript
class StreamingStubEngine {
  async *replayStream(recorded: RecordedStream, config: StubConfig): AsyncIterable<unknown> {
    for (const chunk of recorded.chunks) {
      // Convert back to provider-native chunk shape
      yield this.denormalizeChunk(chunk);

      if (config.preserveTiming && chunk.timingDelay) {
        await sleep(chunk.timingDelay);
      }
    }
  }
}
```

## Interceptor Installation by Provider

### OpenAI SDK (Monkey-patch)

```typescript
class OpenAIInterceptor {
  install(client: OpenAI): void {
    const original = client.chat.completions.create.bind(client.chat.completions);

    client.chat.completions.create = async (...args) => {
      const [request] = args;

      // Start recording span
      const span = this.recorder.startSpan('llm_call', { provider: 'openai' });

      // Record request
      this.recorder.recordEvent(span, 'request', this.adapter.normalizeRequest(request));

      // Check if we're in replay mode
      if (this.stubEngine.isActive()) {
        const recorded = this.stubEngine.findResponse(span);
        if (recorded.stream) {
          return this.stubEngine.replayStream(recorded.stream);
        }
        return recorded.response;
      }

      // Call original
      const response = await original(...args);

      // Handle streaming
      if (request.stream) {
        return this.recorder.recordStream(response, span);
      }

      // Record non-streaming response
      this.recorder.recordEvent(span, 'response', this.adapter.normalizeResponse(response));
      this.recorder.endSpan(span);

      return response;
    };
  }
}
```

### Anthropic SDK (Monkey-patch)

Similar pattern, but Anthropic's streaming API uses `client.messages.stream()` which returns a different abstraction. The interceptor must handle both `create()` and `stream()` methods.

### Framework Hooks (LangChain)

```typescript
class LangChainInterceptor extends BaseCallbackHandler {
  name = 'AgentReplayHandler';

  async handleLLMStart(llm: Serialized, prompts: string[], runId: string): Promise<void> {
    this.recorder.startSpan('llm_call', { runId, provider: llm.id });
  }

  async handleLLMEnd(output: LLMResult, runId: string): Promise<void> {
    const span = this.recorder.getSpan(runId);
    this.recorder.recordEvent(span, 'response', output);
    this.recorder.endSpan(span);
  }
}
```

## Authentication & Configuration

Interceptors should not capture API keys. The request event stores the provider and model, but redacts sensitive headers.

```typescript
function redactSensitiveFields(request: LLMRequest): LLMRequest {
  return {
    ...request,
    raw: {
      ...request.raw,
      apiKey: '[REDACTED]',
      authorization: '[REDACTED]',
    },
  };
}
```

## Error Handling

### Provider Errors

```typescript
class LLMProviderError extends AgentReplayError {
  constructor(
    provider: string,
    public readonly statusCode: number,
    public readonly providerErrorCode: string,
    cause?: Error
  ) {
    super(
      `${provider} API error: ${providerErrorCode} (${statusCode})`,
      'LLM_PROVIDER_ERROR',
      cause
    );
  }
}
```

### Recording Errors

- **Stream interruption**: If a stream is interrupted mid-way, record what was received with an `incomplete` flag.
- **Timeout**: Record the timeout as an error span with the partial response.
- **Rate limit**: Record the rate limit response so replay can simulate backoff behavior if needed.

## Testing LLM Integrations

```typescript
describe('OpenAIAdapter', () => {
  it('should normalize chat completion request', () => {
    const native = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.7,
    };

    const normalized = adapter.normalizeRequest(native);
    expect(normalized.provider).toBe('openai');
    expect(normalized.model).toBe('gpt-4');
    expect(normalized.messages).toHaveLength(1);
  });

  it('should round-trip stream chunks', async () => {
    const chunks = [
      { index: 0, delta: 'Hello', finishReason: null },
      { index: 0, delta: ' world', finishReason: 'stop' },
    ];

    const recorded = await recordStream(chunks);
    const replayed = await collectStream(replayStream(recorded));

    expect(replayed).toBe('Hello world');
  });
});
```

## Resources

- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [Azure OpenAI Service](https://learn.microsoft.com/en-us/azure/ai-services/openai/)
- [LangChain Callbacks](https://js.langchain.com/docs/concepts/callbacks)

---

**Maintained by**: @reaatech and contributors  
**Last Updated**: 2026-04-23
