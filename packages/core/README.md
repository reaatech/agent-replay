# @reaatech/core

Core recording, replay, and debugging engine for Agent Replay.

## Features

- **RecordingEngine** — Capture agent interactions with span lifecycle management
- **ReplayEngine** — Stubbed, live, partial, and diff replay modes
- **PartialReplayOrchestrator** — Replay up to a checkpoint, restore state, then go live
- **ReplayDebugger** — Step-through debugging with breakpoints and watchpoints
- **AnnotationManager** — Add collaborative annotations to traces
- **Diff & Divergence Detection** — Semantic diff, divergence detector, regression detector
- **Trace Serialization** — Line-delimited JSON with streaming support and gzip compression
- **State Capture** — Structured clone, snapshotter registry, determinism controller

## Installation

```bash
npm install @reaatech/core
```

## Quick Start

```typescript
import { RecordingEngine, ReplayEngine, LocalFileStorage } from '@reaatech/core';

// Record
const engine = new RecordingEngine();
const session = engine.startRecording({ name: 'my-run', outputPath: './trace.artrace.json' });

const spanId = engine.startSpan('llm-call', 'llm_call');
engine.captureEvent(
  {
    timestamp: Date.now(),
    type: 'response',
    name: 'resp',
    attributes: {},
    data: { content: 'Hello!' },
  },
  { spanId }
);
engine.endSpan(spanId, 'ok');

const trace = engine.stopRecording(session);

// Replay
const replay = new ReplayEngine();
const result = replay.replay(trace, { mode: 'stubbed', llmProvider: 'openai' });
```

## API Reference

See [API Documentation](../../docs/api) for full reference.
