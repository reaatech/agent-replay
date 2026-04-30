# @reaatech/agent-replay-shared

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-replay-shared.svg)](https://www.npmjs.com/package/@reaatech/agent-replay-shared)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-replay/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-replay/ci.yml?branch=main&label=CI)](https://github.com/reaatech/agent-replay/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Shared types, interfaces, error classes, and configuration for the Agent Replay ecosystem. This package is the canonical source of truth for all trace model shapes, LLM provider abstractions, and storage contracts used by every other `@reaatech/agent-replay-*` package.

## Installation

```bash
npm install @reaatech/agent-replay-shared
# or
pnpm add @reaatech/agent-replay-shared
```

## Feature Overview

- **100+ exported types and interfaces** — complete trace model, LLM abstractions, storage contracts, and configuration shapes
- **7 typed error classes** — `RecordingFailedError`, `ReplayFailedError`, `StateCaptureError`, and more — all extending a serializable `AgentReplayError` base
- **Zero runtime dependencies** — pure TypeScript types and abstract interfaces, fully tree-shakeable
- **Dual ESM/CJS output** — works with `import` and `require`

## Quick Start

```typescript
import {
  type Trace,
  type Span,
  type LLMRequest,
  type LLMResponse,
  type RecordingConfig,
  type ReplayConfig,
  TraceNotFoundError,
  AgentReplayError,
} from "@reaatech/agent-replay-shared";
```

This package is a dependency of every other Agent Replay package. Most consumers will get these types transitively through `@reaatech/agent-replay-core` or the convenience `@reaatech/agent-replay` package.

## Exports

### Trace Data Model

The trace is the fundamental unit — a complete record of an agent interaction.

| Export | Description |
|--------|-------------|
| `Trace` | Top-level container: version, metadata, spans, checkpoints, indexes |
| `TraceMetadata` | Trace identity: id, name, createdAt, agentVersion, environment, tags, summary |
| `TraceSummary` | Lightweight header for list/search operations |
| `TraceHeader` | Serialization header with schema version and format info |
| `TraceIndexes` | Fast lookup indexes: `byId` (span id → array index) and `byKind` |
| `Span` | A single unit of work: id, parentId, name, kind, timestamps, status, events, attributes, links |
| `SpanLink` | Cross-trace reference: traceId, spanId, optional attributes |
| `Event` | A timestamped data point within a span: timestamp, type, name, attributes, data |
| `Checkpoint` | Serialized agent state at a point in time: id, spanId, timestamp, state, context, metadata |
| `CheckpointMetadata` | Name and optional description for a checkpoint |
| `SerializedState` | Full state snapshot: variables, memory, conversation, toolRegistry |
| `MemorySnapshot` / `MemoryEntry` | Key-value memory entries with timestamps |
| `ConversationState` | Array of `Message` objects representing chat history |
| `Message` | A chat message: role (`"system"` \| `"user"` \| `"assistant"` \| `"tool"`), content, toolCalls?, toolCallId? |
| `ToolCall` | A tool invocation: id, name, arguments |
| `ToolDefinition` | A declared tool: name, description, parameters |
| `ToolRegistrySnapshot` | Array of `ToolDefinition` available at capture time |
| `AgentContext` | Session-scoped context for checkpoints: sessionId, variables |
| `CaptureContext` | Options for `captureEvent`: spanId?, timestamp? |

#### Enumerated Types

| Type | Values |
|------|--------|
| `SpanKind` | `"llm_call"` \| `"tool_call"` \| `"agent_step"` \| `"routing_decision"` \| `"state_change"` \| `"error"` |
| `SpanStatus` | `"ok"` \| `"error"` \| `"in_progress"` |
| `EventType` | `"request"` \| `"response"` \| `"error"` \| `"state_snapshot"` \| `"checkpoint"` \| `"annotation"` |

### LLM Provider Abstractions

Provider-agnostic types that all interceptors normalize into.

| Export | Description |
|--------|-------------|
| `LLMRequest` | Normalized request: provider, model, messages, tools?, temperature?, maxTokens?, topP?, stopSequences?, raw |
| `LLMResponse` | Normalized response: id, model, content, toolCalls?, usage?, finishReason, raw |
| `StreamChunk` | A single streaming delta: index, delta, toolCallDelta?, finishReason?, usage? |
| `RecordedStream` | Complete stream recording: chunks array, aggregatedContent, aggregatedToolCalls?, duration, totalChunks |
| `TokenUsage` | Prompt, completion, and total token counts |

### Error Hierarchy

All errors extend the abstract `AgentReplayError` base class, which provides machine-readable `code`, optional `cause`, and JSON serialization via `toJSON()`.

| Error Class | Code | When |
|-------------|------|------|
| `AgentReplayError` | _(base)_ | Base class for all errors |
| `RecordingFailedError` | `RECORDING_FAILED` | Recording session could not start or complete |
| `TraceNotFoundError` | `TRACE_NOT_FOUND` | Requested trace file does not exist |
| `InvalidTraceError` | `INVALID_TRACE` | Trace data failed validation with `ValidationError[]` |
| `ReplayFailedError` | `REPLAY_FAILED` | Replay failed at a specific step |
| `StateCaptureError` | `STATE_CAPTURE_FAILED` | State serialization failed for a given state type |
| `DivergenceError` | `DIVERGENCE_DETECTED` | Live replay diverged from the recorded trace |
| `InterceptorError` | `INTERCEPTOR_FAILED` | LLM provider interceptor could not be installed |

### Storage Abstractions

| Export | Description |
|--------|-------------|
| `TraceStorage` | Pluggable interface: `save`, `load`, `list`, `delete`, `search` |
| `StorageOptions` | Compression and encryption flags |
| `TraceFilter` | Filter traces by tags, date range, or status |
| `SearchQuery` | Full-text search with `limit` and `offset` |
| `TraceSearchResult` | Paginated results with `total` count |

### Configuration

| Export | Description |
|--------|-------------|
| `RecordingConfig` | Recording options: name, providers?, outputPath?, captureState?, checkpointInterval?, tags? |
| `ReplayConfig` | Base replay config: mode, checkpointId?, maxSteps?, timeout?, onProgress?, signal? |
| `PartialReplayConfig` | Extends `ReplayConfig` with `mode: "partial"` and required `checkpointId` |
| `DiffReplayConfig` | Extends `ReplayConfig` with `mode: "diff"` and optional `diffOptions` |
| `ReplayProgress` | Progress callback payload: percent, currentStep, totalSteps |
| `ReplayResult` | Replay output: trace, outputs, duration, divergence? |
| `DivergenceReport` | When live replay diverges: step, expected, actual, path |
| `DiffOptions` | Diff configuration: includeSemantic?, includeStructural?, similarityThreshold? |
| `DiffResult` | Diff output: diffs[], statistics, report, severity |
| `TraceDiff` | Individual difference: type, severity, message, details |
| `DiffStatistics` | Summary: totalDifferences, semanticChanges, structuralChanges |

## Related Packages

- [`@reaatech/agent-replay-core`](https://www.npmjs.com/package/@reaatech/agent-replay-core) — Recording, replay, and debugging engine
- [`@reaatech/agent-replay`](https://www.npmjs.com/package/@reaatech/agent-replay) — Convenience entry point re-exporting all packages

## License

[MIT](https://github.com/reaatech/agent-replay/blob/main/LICENSE)
