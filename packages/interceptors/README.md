# @reaatech/interceptors

LLM provider interceptors for Agent Replay.

## Features

- **OpenAIInterceptor** — Runtime monkey-patch for OpenAI SDK
- **OpenAIAdapter** — Normalize OpenAI types to shared `LLMRequest`/`LLMResponse`
- **AnthropicAdapter** — Normalize Anthropic types to shared abstractions
- **Sensitive field redaction** — Automatic redaction of API keys and auth headers

## Usage

```typescript
import { OpenAIInterceptor } from '@reaatech/interceptors';
import { RecordingEngine } from '@reaatech/core';

const engine = new RecordingEngine();
const interceptor = new OpenAIInterceptor(engine);
await interceptor.install(openaiClient);

// All chat.completions.create calls are now recorded
```
