# Basic Recording Example

This example demonstrates how to record an agent interaction trace.

## Usage

```typescript
import { RecordingEngine, LocalFileStorage } from '@reaatech/agent-replay-core';

const engine = new RecordingEngine();
const session = engine.startRecording({
  name: 'my-agent-run',
  outputPath: './my-trace.artrace.json',
});

// Record an LLM call
const spanId = engine.startSpan('chat-completion', 'llm_call');
engine.captureEvent(
  {
    timestamp: Date.now(),
    type: 'response',
    name: 'llm-response',
    attributes: { model: 'gpt-4' },
    data: { content: 'Hello, world!' },
  },
  { spanId }
);
engine.endSpan(spanId, 'ok');

// Finalize the trace
const trace = engine.stopRecording(session);
console.log(`Recorded ${trace.spans.length} spans`);

// Save to disk
const storage = new LocalFileStorage();
await storage.save(trace, { filePath: './my-trace.artrace.json' });
```

## Running

```bash
npx tsx example.ts
```
