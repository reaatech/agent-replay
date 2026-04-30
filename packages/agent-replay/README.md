# @reaatech/agent-replay

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-replay.svg)](https://www.npmjs.com/package/@reaatech/agent-replay)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-replay/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-replay/ci.yml?branch=main&label=CI)](https://github.com/reaatech/agent-replay/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

One package, everything you need. The convenience entry point for the Agent Replay ecosystem — re-exports the complete public API of the core engine, LLM interceptors, and shared types from a single import.

## Installation

```bash
npm install @reaatech/agent-replay
# or
pnpm add @reaatech/agent-replay
```

## Feature Overview

- **Single dependency** — install one package and get the full Agent Replay API
- **Re-exports from three packages** — `@reaatech/agent-replay-core`, `@reaatech/agent-replay-interceptors`, and `@reaatech/agent-replay-shared`
- **Full type safety** — all types, interfaces, and error classes included
- **Tree-shakeable** — only the exports you import end up in your bundle

## Quick Start

```typescript
import {
  RecordingEngine,
  ReplayEngine,
  LocalFileStorage,
  OpenAIInterceptor,
  type Trace,
  type RecordingConfig,
} from "@reaatech/agent-replay";

// Recording
const engine = new RecordingEngine();
const session = engine.startRecording({ name: "hello-world" });

// Intercept OpenAI calls
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const interceptor = new OpenAIInterceptor(engine);
await interceptor.install(openai);

// ... run your agent ...

// Stop and save
const trace = engine.stopRecording(session);
await new LocalFileStorage("./traces").save(trace);

// Replay (zero tokens)
const replay = new ReplayEngine();
const result = replay.replay(trace, { mode: "stubbed" });
console.log(result.outputs);
```

## What's Included

This package re-exports the complete public API of:

| Package | Contents |
|---------|----------|
| `@reaatech/agent-replay-core` | `RecordingEngine`, `ReplayEngine`, `PartialReplayOrchestrator`, `ReplayDebugger`, `DiffEngine`, `SemanticDiffEngine`, `RegressionDetector`, `DivergenceDetector`, `AnomalyDetector`, `LocalFileStorage`, `TraceSerializer`, `TraceComparer`, `TraceSummarizer`, `AnnotationManager`, `StreamingRecorder`, `StreamingStubEngine`, `StructuredCloneStrategy`, `SnapshotterRegistry`, `FrameworkAdapterRegistry`, `DeterminismController`, `TraceBuilder`, `migrateTrace`, `validateTraceVersion`, `runCICDCheck`, and all formatters |
| `@reaatech/agent-replay-interceptors` | `OpenAIInterceptor`, `AnthropicInterceptor`, `BaseInterceptor`, `InterceptorRegistry`, `OpenAIAdapter`, `AnthropicAdapter`, `LLMProviderAdapter` |
| `@reaatech/agent-replay-shared` | `Trace`, `Span`, `Event`, `Checkpoint`, `SerializedState`, `LLMRequest`, `LLMResponse`, `StreamChunk`, `RecordedStream`, `RecordingConfig`, `ReplayConfig`, `AgentReplayError`, `RecordingFailedError`, `ReplayFailedError`, `TraceNotFoundError`, `StateCaptureError`, `DivergenceError`, `InterceptorError`, and all types and interfaces |

See each sub-package's README for detailed API documentation:

- [@reaatech/agent-replay-core](../core/README.md)
- [@reaatech/agent-replay-interceptors](../interceptors/README.md)
- [@reaatech/agent-replay-shared](../shared/README.md)

## Granular Imports

If you prefer smaller installs, you can install only the packages you need:

```bash
npm install @reaatech/agent-replay-core        # Engine only
npm install @reaatech/agent-replay-interceptors # Provider interceptors
npm install @reaatech/agent-replay-shared       # Types only
npm install @reaatech/agent-replay-cli          # CLI tool (install globally)
npm install @reaatech/agent-replay-integrations # Framework integrations
```

## Related Packages

- [`@reaatech/agent-replay-core`](https://www.npmjs.com/package/@reaatech/agent-replay-core) — Recording and replay engine
- [`@reaatech/agent-replay-interceptors`](https://www.npmjs.com/package/@reaatech/agent-replay-interceptors) — LLM provider interceptors
- [`@reaatech/agent-replay-shared`](https://www.npmjs.com/package/@reaatech/agent-replay-shared) — Types, errors, and configuration
- [`@reaatech/agent-replay-cli`](https://www.npmjs.com/package/@reaatech/agent-replay-cli) — Command-line interface
- [`@reaatech/agent-replay-integrations`](https://www.npmjs.com/package/@reaatech/agent-replay-integrations) — Framework integrations

## License

[MIT](https://github.com/reaatech/agent-replay/blob/main/LICENSE)
