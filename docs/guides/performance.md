# Performance Tuning Guide

## Recording Overhead

Agent Replay adds minimal overhead to your agent:

- **Span creation**: ~0.1ms per span
- **Event capture**: ~0.05ms per event
- **Checkpoint creation**: ~1-5ms depending on state size

To minimize overhead:

1. Create checkpoints only at key decision points, not every step
2. Disable state capture if not needed for replay: `--no-state`
3. Use streaming recording for real-time chunk capture

## Trace Size Optimization

### Compression

Enable gzip compression for large traces:

```typescript
import { LocalFileStorage } from '@reaatech/core';
const storage = new LocalFileStorage();
await storage.save(trace, { compress: true });
```

Typical compression ratios: **5:1 to 20:1** depending on content redundancy.

### Streaming for Large Traces

For traces with thousands of spans, use streaming deserialization:

```typescript
import { TraceSerializer } from '@reaatech/core';
const serializer = new TraceSerializer();

for await (const item of serializer.streamDeserialize('huge-trace.artrace.json')) {
  if (item.kind === 'span') {
    processSpan(item);
  }
}
```

This keeps memory usage constant regardless of trace size.

## Replay Speed

Stubbed replay is **>100x real-time** for typical traces. To maximize speed:

1. Use `stubbed` mode for unit tests
2. Disable timing preservation if not needed
3. Use `ReplayEngine` directly instead of `PartialReplayOrchestrator` when you don't need checkpoint restoration

## Memory Usage

Typical memory usage for a 1000-span trace:

- **Recording**: ~10MB
- **Full deserialization**: ~50MB
- **Streaming processing**: ~5MB

## Benchmarks

Run the built-in benchmarks:

```bash
npx vitest bench tests/benchmarks
```

Expected results on modern hardware:

- Serialize 100 spans: <50ms
- Deserialize 100 spans: <30ms
- Stubbed replay 50 spans: <10ms
