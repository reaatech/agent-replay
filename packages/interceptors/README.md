# @reaatech/agent-replay-interceptors

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-replay-interceptors.svg)](https://www.npmjs.com/package/@reaatech/agent-replay-interceptors)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-replay/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-replay/ci.yml?branch=main&label=CI)](https://github.com/reaatech/agent-replay/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Runtime monkey-patch interceptors for OpenAI and Anthropic SDKs. Transparently records all LLM API calls into Agent Replay traces without requiring changes to your agent code.

## Installation

```bash
npm install @reaatech/agent-replay-interceptors
# or
pnpm add @reaatech/agent-replay-interceptors
```

## Feature Overview

- **OpenAIInterceptor** — monkey-patches `client.chat.completions.create` to record every call
- **AnthropicInterceptor** — monkey-patches `client.messages.create` to record every call
- **Streaming support** — transparently records streaming responses while passing chunks through in real time
- **Provider adapters** — normalizes provider-specific types into shared `LLMRequest`/`LLMResponse`/`StreamChunk` abstractions
- **Automatic redaction** — API keys, auth headers, tokens, and secrets are replaced with `[REDACTED]` before storage
- **InterceptorRegistry** — manage multiple interceptors with bulk enable/disable
- **Extensible** — extend `BaseInterceptor` to add support for new LLM providers

## Quick Start

```typescript
import OpenAI from "openai";
import { RecordingEngine } from "@reaatech/agent-replay-core";
import { OpenAIInterceptor } from "@reaatech/agent-replay-interceptors";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const engine = new RecordingEngine();
const interceptor = new OpenAIInterceptor(engine);

// Install the interceptor — transparent, no agent code changes needed
await interceptor.install(openai);

// All chat.completions.create calls are now recorded
const session = engine.startRecording({ name: "openai-run" });

const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello, world!" }],
});

const trace = engine.stopRecording(session);
await interceptor.uninstall();
```

## Supported Providers

| Provider | Interceptor | SDK Method Patched | Streaming |
|----------|-------------|-------------------|-----------|
| OpenAI | `OpenAIInterceptor` | `client.chat.completions.create` | Yes |
| Anthropic | `AnthropicInterceptor` | `client.messages.create` | Yes |

## API Reference

### Interceptors

#### `OpenAIInterceptor`

Monkey-patches `client.chat.completions.create` to record all calls. Supports both streaming and non-streaming requests.

```typescript
import { OpenAIInterceptor } from "@reaatech/agent-replay-interceptors";

const interceptor = new OpenAIInterceptor(recordingEngine);
const result = await interceptor.install(openaiClient);
await interceptor.uninstall();
```

| Method | Description |
|--------|-------------|
| `install(client)` | Patches the client's `create` method. Returns `InstallationResult`. |
| `uninstall()` | Restores the original `create` method. |

#### `AnthropicInterceptor`

Monkey-patches `client.messages.create` to record all calls. Supports both streaming and non-streaming requests.

```typescript
import { AnthropicInterceptor } from "@reaatech/agent-replay-interceptors";

const interceptor = new AnthropicInterceptor(recordingEngine);
const result = await interceptor.install(anthropicClient);
await interceptor.uninstall();
```

#### `BaseInterceptor`

Abstract base class for building custom provider interceptors. Provides:

| Member | Description |
|--------|-------------|
| `adapter: LLMProviderAdapter` | The adapter used for request/response normalization |
| `recorder: RecordingEngine` | The recording engine to capture into |
| `install(target)` | Abstract — implement your monkey-patch logic |
| `uninstall()` | Abstract — implement your cleanup logic |
| `redactSensitiveFields(request)` | Utility to redact API keys, tokens, and secrets from a request object |

### Adapters

Adapters normalize provider-specific types into the shared `LLMRequest`/`LLMResponse`/`StreamChunk` abstractions.

#### `LLMProviderAdapter`

Interface for adapter implementations:

```typescript
interface LLMProviderAdapter {
  readonly provider: string;
  normalizeRequest(nativeRequest: unknown): LLMRequest;
  normalizeResponse(nativeResponse: unknown): LLMResponse;
  normalizeChunk(nativeChunk: unknown): StreamChunk;
  denormalizeRequest(request: LLMRequest): unknown;
}
```

| Export | Description |
|--------|-------------|
| `OpenAIAdapter` | Normalizes OpenAI request/response/chunk types |
| `AnthropicAdapter` | Normalizes Anthropic request/response/chunk types |

### Registry

#### `InterceptorRegistry`

Manages multiple interceptors with bulk enable/disable.

```typescript
import { InterceptorRegistry } from "@reaatech/agent-replay-interceptors";

const registry = new InterceptorRegistry();
registry.register("openai", openaiInterceptor, openaiClient);
registry.register("anthropic", anthropicInterceptor, anthropicClient);

await registry.enable(["openai", "anthropic"]);
// ... run agent ...
await registry.disable();
```

| Method | Description |
|--------|-------------|
| `register(provider, interceptor, target?)` | Register an interceptor with an optional target client. |
| `enable(providers)` | Install interceptors for the given provider names. |
| `disable()` | Uninstall all registered interceptors. |

## Usage Patterns

### Streaming

Streaming is fully transparent — your code doesn't need to know recording is happening:

```typescript
const stream = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Tell me a story" }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
// The stream is recorded as a RecordedStream in the trace
```

### Anthropic

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicInterceptor } from "@reaatech/agent-replay-interceptors";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const interceptor = new AnthropicInterceptor(engine);
await interceptor.install(anthropic);

const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello, Claude!" }],
});
```

### Sensitive Field Redaction

All interceptors automatically redact sensitive fields before they are stored:

- `apiKey`, `api_key`, `authorization`, `x-api-key`
- `token`, `secret`, `password`
- Any header matching these patterns (case-insensitive)

Redacted values are replaced with `[REDACTED]`. The original request still passes through to the provider unchanged.

### Building a Custom Interceptor

Extend `BaseInterceptor` and implement an `LLMProviderAdapter`:

```typescript
import { BaseInterceptor, type LLMProviderAdapter } from "@reaatech/agent-replay-interceptors";
import { type RecordingEngine } from "@reaatech/agent-replay-core";

class MyAdapter implements LLMProviderAdapter {
  readonly provider = "my-provider";
  normalizeRequest(native: unknown) { /* ... */ }
  normalizeResponse(native: unknown) { /* ... */ }
  normalizeChunk(native: unknown) { /* ... */ }
  denormalizeRequest(request: LLMRequest) { /* ... */ }
}

class MyInterceptor extends BaseInterceptor {
  constructor(recorder: RecordingEngine) {
    super(new MyAdapter(), recorder);
  }
  async install(target: unknown) { /* patch target */ }
  async uninstall() { /* restore original */ }
}
```

## Related Packages

- [`@reaatech/agent-replay-core`](https://www.npmjs.com/package/@reaatech/agent-replay-core) — Recording and replay engine
- [`@reaatech/agent-replay-shared`](https://www.npmjs.com/package/@reaatech/agent-replay-shared) — Types, errors, and configuration
- [`@reaatech/agent-replay`](https://www.npmjs.com/package/@reaatech/agent-replay) — Convenience entry point re-exporting all packages

## License

[MIT](https://github.com/reaatech/agent-replay/blob/main/LICENSE)
