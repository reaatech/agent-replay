# @reaatech/agent-replay-core

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-replay-core.svg)](https://www.npmjs.com/package/@reaatech/agent-replay-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-replay/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-replay/ci.yml?branch=main&label=CI)](https://github.com/reaatech/agent-replay/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Deterministic recording, replay, and debugging engine for AI agent interactions. Capture traces once, replay infinitely — without consuming LLM tokens.

## Installation

```bash
npm install @reaatech/agent-replay-core
# or
pnpm add @reaatech/agent-replay-core
```

## Feature Overview

- **RecordingEngine** — capture agent interactions with span lifecycle management, event recording, and checkpoint creation
- **ReplayEngine** — stubbed, live, partial, and diff replay modes with progress callbacks
- **Partial Replay** — replay up to any checkpoint with stubbed responses, restore state, then go live
- **ReplayDebugger** — step-through debugging with conditional breakpoints, watch expressions, and state inspection
- **DiffEngine** — structural and semantic comparison of recorded vs replayed traces
- **SemanticDiffEngine** — text similarity-based comparison of LLM outputs, tool calls, and routing decisions
- **RegressionDetector** — automated regression detection for CI/CD pipelines
- **DivergenceDetector** — pinpoint exactly where live replay diverges from the recorded trace
- **AnomalyDetector** — detect duration spikes, error bursts, token spikes, and infinite loops
- **CI/CD Helper** — single-function entry point for running all checks in automation
- **TraceSerializer** — line-delimited JSON with gzip compression and streaming deserialization
- **TraceComparator** — multi-trace statistical comparison
- **TraceSummarizer** — automatic trace summarization with highlights and concerns
- **AnnotationManager** — collaborative annotations on traces for post-hoc analysis
- **Streaming** — tee-based stream recording and deterministic stream replay with optional timing preservation
- **State Capture** — structured clone, snapshotter registry, and determinism control (clock freezing, random seeding)

## Quick Start

### Recording

```typescript
import { RecordingEngine, LocalFileStorage } from "@reaatech/agent-replay-core";

const engine = new RecordingEngine();
const session = engine.startRecording({
  name: "my-agent-run",
  tags: ["production", "v1.2.0"],
});

const spanId = engine.startSpan("gpt-4-chat", "llm_call");
engine.captureEvent(
  {
    timestamp: Date.now(),
    type: "request",
    name: "llm-request",
    attributes: { model: "gpt-4" },
    data: { messages: [{ role: "user", content: "Hello" }] },
  },
  { spanId }
);
// ... make your LLM call ...
engine.captureEvent(
  {
    timestamp: Date.now(),
    type: "response",
    name: "llm-response",
    attributes: {},
    data: { content: "Hello! How can I help?" },
  },
  { spanId }
);
engine.endSpan(spanId, "ok");

const trace = engine.stopRecording(session);

// Persist to disk
const storage = new LocalFileStorage("./traces");
await storage.save(trace);
```

### Replaying

```typescript
import { ReplayEngine, LocalFileStorage } from "@reaatech/agent-replay-core";

const storage = new LocalFileStorage("./traces");
const trace = await storage.load("trace-1714348800000-0");

const replay = new ReplayEngine();
const result = replay.replay(trace, {
  mode: "stubbed",
  onProgress: (p) => console.log(`${p.percent}% complete`),
});

console.log(result.outputs); // Replayed LLM responses — zero tokens consumed
```

## API Reference

### RecordingEngine

Primary API for capturing agent interactions.

| Method | Description |
|--------|-------------|
| `startRecording(config: RecordingConfig)` | Begin a new recording session. Returns a `RecordingSession`. |
| `stopRecording(session: RecordingSession)` | Finalize the session and return the finalized `Trace`. |
| `startSpan(name: string, kind: SpanKind)` | Start a new span. Returns the span ID. |
| `endSpan(spanId: string, status?: "ok" \| "error")` | End a span with optional status. |
| `captureEvent(event: Event, context: CaptureContext)` | Attach an event to a span (or current in-progress span). |
| `createActiveSessionCheckpoint(state: unknown)` | Create a checkpoint in the active session. |
| `isRecording` | Read-only flag indicating active session status. |

#### `RecordingSession`

| Method | Description |
|--------|-------------|
| `captureEvent(event, context)` | Delegate to the engine's `captureEvent`. |
| `createCheckpoint(state)` | Create a checkpoint scoped to this session. |

### ReplayEngine

Executes replay of recorded traces in four modes.

```typescript
const result = replay.replay(trace, { mode: "stubbed" });
// result: { trace: Trace, outputs: unknown[], duration: number, divergence?: DivergenceReport }
```

| Mode | Description | Token Cost |
|------|-------------|------------|
| `"stubbed"` | Replays recorded LLM responses from the trace | Zero |
| `"live"` | Re-executes LLM calls through installed interceptors | Full |
| `"partial"` | Replays up to a checkpoint with stubs, restores state, then goes live | Partial |
| `"diff"` | Compares live LLM outputs against recorded trace, detecting divergence | Full |

### PartialReplayOrchestrator

Advanced replay with checkpoint-based state restoration and go-live transitions.

```typescript
const orchestrator = new PartialReplayOrchestrator();

// Full workflow: find checkpoint → stub replay → restore state → go live → execute
const result = await orchestrator.partialReplay(
  trace,
  "cp-3",
  { mode: "partial", checkpointId: "cp-3" },
  async (liveSpans) => {
    // Your live executor making actual LLM calls
    return { trace, outputs, duration };
  }
);
```

| Method | Description |
|--------|-------------|
| `findCheckpoint(trace, checkpointId)` | Locate a checkpoint by ID. |
| `findCheckpointSpanIndex(trace, checkpoint)` | Find the span index at which a checkpoint was created. |
| `restoreDeterminism(checkpoint)` | Freeze clock, seed random for deterministic replay. |
| `goLive()` | Deactivate mocks and prepare for live LLM calls. |
| `replaySlice(trace, start, end, onProgress?)` | Stubbed replay of a span range. |
| `partialReplay(trace, checkpointId, config, liveExecutor)` | Run the full partial replay workflow. |
| `cleanup()` | Restore all mocked globals. |

### ReplayDebugger

Interactive step-through debugging with breakpoints and watchpoints.

```typescript
const debugger = new ReplayDebugger(trace);

debugger.addBreakpoint({ kind: "llm_call", name: /error/i });
debugger.setBreakpointHandler(async (hit, session) => {
  console.log("Breakpoint hit:", hit.span.name);
  return true; // pause execution
});

const session = debugger.start();
await debugger.runToCompletion();

// Inspect results
console.log(formatDebugSession(debugger.getSession()));
```

| Method | Description |
|--------|-------------|
| `start()` | Begin a new debug session. |
| `stepForward()` | Advance one span. Returns `DebugSnapshot` or null. |
| `stepBackward()` | Move back one span. |
| `goToStep(stepIndex)` | Jump to a specific span index. |
| `goToCheckpoint(checkpointId)` | Jump to a checkpoint's span. |
| `continue()` | Run until next breakpoint or end. |
| `addBreakpoint(condition)` | Add a conditional breakpoint (kind, name/regex, stepIndex, predicate). |
| `addWatchpoint(expression)` | Add a watch expression using dot-notation paths. |
| `removeBreakpoint(id)` / `removeWatchpoint(id)` | Remove by ID. |
| `toggleBreakpoint(id)` | Enable/disable a breakpoint. |
| `runToCompletion()` | Execute full trace, collecting watchpoint results. |
| `evaluateWatchpoints()` | Evaluate all watch expressions against history. |
| `inspectVariables()` / `inspectEvents()` | Inspect state at the current step. |
| `getSession()` | Get the full `DebugSession` state. |

### Diff & Comparison

#### DiffEngine

Structural and semantic comparison of recorded vs replayed traces.

| Method | Description |
|--------|-------------|
| `compare(recorded, replayed, options)` | Compare traces and return `DiffResult` with severity. |

#### SemanticDiffEngine

Text similarity-based semantic comparison of LLM outputs.

```typescript
const engine = new SemanticDiffEngine({ textSimilarityThreshold: 0.95 });
const result = engine.compare(baselineTrace, currentTrace);
// result: { differences, overallSimilarity, maxSeverity }
```

#### DivergenceDetector

Pinpoints exactly where live replay diverges from the recorded trace.

| Method | Description |
|--------|-------------|
| `detect(recorded, live, options?)` | Returns `DivergenceReportDetailed` or null if no divergence. |

#### RegressionDetector

Automated regression detection with configurable thresholds.

| Method | Description |
|--------|-------------|
| `detect(baseline, current)` | Detect regressions across error rate, duration, LLM calls, and tool call order. |

#### AnomalyDetector

Detects unusual patterns in traces.

| Method | Description |
|--------|-------------|
| `detect(trace)` | Detect duration spikes, error bursts, pattern breaks, token spikes, and loops. |

#### TraceComparator

Multi-trace statistical comparison.

| Method | Description |
|--------|-------------|
| `compare(traces)` | Compare multiple traces: common spans, unique spans, duration stats, error rates, kind distributions. |

### CI/CD Helper

Single-function entry point for running all checks in automation.

```typescript
import { runCICDCheck } from "@reaatech/agent-replay-core";

const result = runCICDCheck(currentTrace, {
  baseline: baselineTrace,
  failOnRegression: true,
  minSimilarity: 0.95,
  failOnAnomaly: true,
  failOnDivergence: false,
});

if (!result.passed) {
  console.error(result.formattedReport);
  process.exit(1);
}
```

### Storage & Serialization

#### LocalFileStorage

Filesystem-based `TraceStorage` implementation.

```typescript
const storage = new LocalFileStorage("./traces");

await storage.save(trace);
const trace = await storage.load("trace-123");
const summaries = await storage.list({ tags: ["production"] });
const results = await storage.search({ text: "error", limit: 10 });
await storage.delete("trace-123");
```

#### TraceSerializer

Line-delimited JSON serialization with gzip support.

| Method | Description |
|--------|-------------|
| `serialize(trace, path, options?)` | Write trace to `.artrace.json` file (with optional gzip compression). |
| `deserialize(path)` | Read and parse a full trace from disk. |
| `streamDeserialize(path)` | Async generator yielding spans/checkpoints one at a time (memory-efficient). |

#### Trace Migration

| Export | Description |
|--------|-------------|
| `migrateTrace(trace)` | Migrate a trace to the current format version. |
| `validateTraceVersion(header)` | Validate version compatibility (major version check). |
| `CURRENT_TRACE_VERSION` | Current trace format version (`'1.0.0'`). |

### Streaming

#### StreamingRecorder

Tee-based stream recording — passes chunks through to the consumer while recording them.

```typescript
const recorder = new StreamingRecorder();
for await (const chunk of recorder.record(source, normalizeChunk)) {
  yield chunk; // Consumer receives chunks in real time
}
const recorded = recorder.finalize(aggregatedResponse);
```

#### StreamingStubEngine

Deterministic stream replay with optional timing preservation.

```typescript
const stub = new StreamingStubEngine({ preserveTiming: true });
for await (const chunk of stub.replayStream(recordedStream, denormalizeChunk)) {
  yield chunk;
}
// Or aggregate into a single response:
const response = stub.toResponse(recordedStream);
```

### State Capture

| Export | Description |
|--------|-------------|
| `StructuredCloneStrategy` | Serialize state using `structuredClone` with error handling. |
| `Snapshotter<T>` | Interface for custom snapshot/restore logic. |
| `SnapshotterRegistry` | Registry of type-specific snapshotters with fallback to structured clone. |
| `FrameworkStateAdapter` | Interface for framework-specific state capture and restoration. |
| `FrameworkAdapterRegistry` | Registry of framework adapters. |
| `DeterminismController` | Freeze `Date.now()`, seed `Math.random()`, and mock `crypto.randomUUID` for deterministic replay. |

### AnnotationManager

Collaborative annotations for post-hoc trace analysis.

| Method | Description |
|--------|-------------|
| `add(annotation)` | Add a new annotation (spanId, content, author, severity?, tags?). |
| `remove(id)` | Remove by ID. |
| `update(id, updates)` | Update content, severity, or tags. |
| `list(query?)` | List with optional filtering (spanId, author, severity, tags, contentContains). |
| `getForSpan(spanId)` | Get all annotations for a specific span. |
| `countBySeverity()` | Count annotations grouped by severity. |
| `toEvents()` | Serialize annotations as trace events. |
| `loadFromTrace(trace)` | Deserialize annotations from trace events. |
| `clear()` | Remove all annotations. |

### TraceSummarizer

Automatic trace summarization into human-readable reports.

| Method | Description |
|--------|-------------|
| `summarize(trace)` | Generate `TraceSummaryReport` with description, stats, highlights, and concerns. |

## Replay Modes in Detail

### Stubbed (Default)
Replays recorded LLM responses from the trace. Zero tokens, zero API calls. Fast and deterministic. Use for rapid iteration during development.

### Live
Re-executes LLM calls against the actual provider. Requires interceptors from `@reaatech/agent-replay-interceptors`. Use for validating that code changes produce correct results.

### Partial
Replays the first N steps with stubbed responses (zero cost), restores agent state from the checkpoint, then switches to live execution for the remaining steps. Ideal for debugging a specific portion of a long agent run.

### Diff
Compares live LLM outputs against the recorded trace, detecting any divergence. Reports structural changes, semantic differences, and overall severity. Use in CI/CD to catch regressions before deployment.

## File Format

Traces use the `.artrace.json` extension with line-delimited JSON:

```
Line 1:   TraceHeader {"version": "1.0.0", "format": "artrace-json-v1", "metadata": {...}, "schema": {...}}
Lines 2-N: {"_kind": "span", "id": "span-0", ...} or {"_kind": "checkpoint", "id": "cp-0", ...}
Last:     {"kind": "footer", "indexes": {...}, "summary": {...}}
```

Optional gzip compression (`.artrace.json.gz`) is supported by `TraceSerializer`.

## Related Packages

- [`@reaatech/agent-replay-shared`](https://www.npmjs.com/package/@reaatech/agent-replay-shared) — Types, errors, and configuration
- [`@reaatech/agent-replay-interceptors`](https://www.npmjs.com/package/@reaatech/agent-replay-interceptors) — LLM provider interceptors (OpenAI, Anthropic)
- [`@reaatech/agent-replay-integrations`](https://www.npmjs.com/package/@reaatech/agent-replay-integrations) — Framework integrations (LangChain, LangGraph)
- [`@reaatech/agent-replay-cli`](https://www.npmjs.com/package/@reaatech/agent-replay-cli) — Command-line interface
- [`@reaatech/agent-replay`](https://www.npmjs.com/package/@reaatech/agent-replay) — Convenience entry point re-exporting all packages

## License

[MIT](https://github.com/reaatech/agent-replay/blob/main/LICENSE)
