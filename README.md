# Agent Replay

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/status-pre--alpha-red)](https://github.com/reaatech/agent-replay)

> A deterministic replay system for AI agent interactions. Record, replay, and debug agent behaviors without consuming LLM tokens. Think VCR for HTTP, but for AI agent workflows.

---

## Overview

Developing AI agents requires rapid iteration. Each debug cycle burns tokens and costs money. **Agent Replay** decouples agent debugging from live LLM calls by recording complete interaction traces that can be replayed deterministically.

| Capability                | Description                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| **Record & Replay**       | Capture every LLM call, tool invocation, and routing decision in a trace.                       |
| **Token-Free Debugging**  | Replay traces with stubbed responses — zero API calls, zero cost.                               |
| **Partial Replay**        | Replay up to step _N_, then go live. Debug "the agent was fine for 6 turns then went sideways." |
| **Diff Mode**             | Run live LLM calls against a recorded trace and compare outputs to detect behavioral drift.     |
| **Deterministic Testing** | Seeded PRNG, frozen clock, and snapshot environment for reproducible tests.                     |

## Current Status

Agent Replay is in **pre-alpha** (v0.1.0). Core data models, the monorepo structure, and CI/CD are in place. Package APIs are under active development and subject to change.

See [DEV_PLAN.md](./DEV_PLAN.md) for the roadmap and [ARCHITECTURE.md](./ARCHITECTURE.md) for the technical design.

## Development Setup

### Prerequisites

- **Node.js** >= 18.0.0
- **pnpm** >= 8.0.0

### Getting Started

```bash
git clone https://github.com/reaatech/agent-replay.git
cd agent-replay
pnpm install
pnpm build
pnpm test
```

### Scripts

| Command              | Description                    |
| -------------------- | ------------------------------ |
| `pnpm build`         | Build all packages             |
| `pnpm test`          | Run test suite                 |
| `pnpm test:watch`    | Run tests in watch mode        |
| `pnpm test:coverage` | Run tests with coverage report |
| `pnpm lint`          | Lint all packages              |
| `pnpm format`        | Format code with Prettier      |
| `pnpm type-check`    | Type-check all packages        |
| `pnpm clean`         | Clean build artifacts          |

## Packages

| Package                  | npm Scope               | Description                                          | Status      |
| ------------------------ | ----------------------- | ---------------------------------------------------- | ----------- |
| `@reaatech/shared`       | `packages/shared`       | Shared types, interfaces, and utilities              | In progress |
| `@reaatech/core`         | `packages/core`         | Recording, replay, and diff engines                  | In progress |
| `@reaatech/interceptors` | `packages/interceptors` | LLM provider interceptors (OpenAI, Anthropic)        | In progress |
| `@reaatech/agent-replay` | `packages/agent-replay` | Convenience package — re-exports core + interceptors | In progress |
| `@reaatech/cli`          | `packages/cli`          | Command-line interface                               | Planned     |
| `@reaatech/integrations` | `packages/integrations` | Framework integrations (LangChain, LangGraph)        | Planned     |
| `@reaatech/web-ui`       | `packages/web-ui`       | Web-based trace viewer                               | Planned     |

## Architecture

Agent Replay is built around a trace-based data model with hierarchical spans and events, inspired by distributed tracing systems like OpenTelemetry.

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│    Recording        │     │    Trace Storage    │     │    Replay           │
│    Engine           │ ──► │    (.artrace.json)  │ ──► │    Engine           │
│                     │     │                     │     │                     │
│  • Interceptors     │     │  • Local filesystem │     │  • Stubbed replay   │
│  • Span builder     │     │  • Future: SQLite   │     │  • Partial replay   │
│  • State capture    │     │  • Future: S3       │     │  • Diff mode        │
│  • Checkpoints      │     │                     │     │  • Debugger         │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

- **Traces** are stored as line-delimited JSON (`.artrace.json`) for streaming and incremental processing.
- **Spans** represent discrete operations (LLM calls, tool invocations, agent steps).
- **Checkpoints** capture agent state for partial replay and resumption.
- **Diff engine** performs semantic and structural comparisons between runs.

Read the full architecture in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Concepts

### Trace Format

Traces use the `.artrace.json` format — line-delimited JSON with a header, span lines, and a footer index. Each span contains typed events (`request`, `response`, `error`, `state_snapshot`, `checkpoint`, `annotation`) with provider-agnostic payloads.

### Recording

```typescript
const engine = new RecordingEngine();
const session = engine.startRecording({ name: 'my-agent-run' });

const spanId = engine.startSpan('llm-call', 'llm_call');
engine.captureEvent(
  {
    timestamp: Date.now(),
    type: 'response',
    name: 'llm-response',
    attributes: {},
    data: { content: 'Hello!' },
  },
  { spanId }
);
engine.endSpan(spanId);

const trace = engine.stopRecording(session);
```

### Replay Modes

| Mode      | Behavior                                                   |
| --------- | ---------------------------------------------------------- |
| `stubbed` | Returns recorded responses — zero LLM calls.               |
| `live`    | Executes real LLM calls alongside the trace.               |
| `partial` | Replays to a checkpoint, then switches to live.            |
| `diff`    | Runs live and compares outputs against the recorded trace. |

### State Capture

Partial replay requires snapshotting agent state at checkpoints. The system supports:

- **Default**: `structuredClone` with fallback to JSON serialization.
- **Custom snapshotters**: Register custom serializers for non-serializable objects (class instances, circular references).
- **Framework adapters**: LangChain, LangGraph, and AutoGen adapters for framework-specific state.

Functions, closures, and external resources (DB connections, file handles) are not captured — code changes require full re-recording.

## Roadmap

| Phase | Focus                                       | Timeline    |
| ----- | ------------------------------------------- | ----------- |
| **1** | Core recording/replay engine + trace format | In progress |
| **2** | Partial replay, diff mode, CLI debugger     | Upcoming    |
| **3** | Framework integrations, test suite          | Upcoming    |
| **4** | Performance, enterprise features, web UI    | Upcoming    |

See [DEV_PLAN.md](./DEV_PLAN.md) for the detailed plan with individual task breakdowns.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow, coding standards, and pull request guidelines.

### Quality Gates

- TypeScript strict mode enabled
- Minimum 90% test coverage
- Conventional commits
- Prettier + ESLint formatting

## Documentation

- [Architecture](ARCHITECTURE.md) — System design and component overview
- [Development Plan](DEV_PLAN.md) — Roadmap and milestone tracking
- [Contributing](CONTRIBUTING.md) — How to contribute
- [Agent Guide](AGENTS.md) — Agent development reference

## License

MIT © [Reaatech](https://github.com/reaatech) and contributors
