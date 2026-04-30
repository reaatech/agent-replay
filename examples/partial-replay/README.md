# Partial Replay Example

This example shows how to replay a trace up to a checkpoint, then continue with live execution.

## Usage

```typescript
import { PartialReplayOrchestrator, LocalFileStorage } from '@reaatech/agent-replay-core';

const storage = new LocalFileStorage();
const trace = await storage.load('./my-trace.artrace.json');

const orchestrator = new PartialReplayOrchestrator();
const checkpointId = trace.checkpoints[0].id;

const result = await orchestrator.partialReplay(trace, checkpointId, {}, async spans => {
  // Your live agent code here
  return {
    trace,
    outputs: spans.map(() => ({ content: 'live response' })),
    duration: 100,
  };
});

console.log(`Replayed with ${result.outputs.length} outputs`);
```

## Running

```bash
npx tsx example.ts
```
