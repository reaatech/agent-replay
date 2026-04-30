# Debugging Best Practices

## Quick Start

```bash
# Record your agent
agent-replay record -o ./trace.artrace.json

# Replay with breakpoints at LLM calls
agent-replay debug -t ./trace.artrace.json -k llm_call

# Compare against baseline
agent-replay diff -b ./baseline.artrace.json -c ./current.artrace.json
```

## Using the ReplayDebugger

```typescript
import { ReplayDebugger } from '@reaatech/agent-replay-core';

const dbg = new ReplayDebugger(trace);

// Break on specific span kinds
dbg.addBreakpoint({ kind: 'tool_call' });

// Break on custom conditions
dbg.addBreakpoint({
  predicate: span => span.status === 'error',
});

// Watch expressions
dbg.addWatchpoint('span.name');
dbg.addWatchpoint('variables.count');

// Step through
await dbg.start();
while (await dbg.stepForward()) {
  const vars = dbg.inspectVariables();
  console.log('Current variables:', vars);
}
```

## Partial Replay for Regression Hunting

When a bug appears after N steps:

```typescript
import { PartialReplayOrchestrator } from '@reaatech/agent-replay-core';

const orchestrator = new PartialReplayOrchestrator();
const result = await orchestrator.partialReplay(
  trace,
  'checkpoint-after-step-5',
  {},
  async spans => {
    // Your live agent code here
    return liveExecutor(spans);
  }
);
```

## Common Patterns

### Finding the First Divergence

```typescript
const detector = new DivergenceDetector();
const divergence = detector.detect(baseline, liveResult);
if (divergence) {
  console.log(`First divergence at step ${divergence.step}`);
  console.log(`Path: ${divergence.path}`);
}
```

### Annotating Traces for Team Review

```typescript
import { AnnotationManager } from '@reaatech/agent-replay-core';

const annotations = new AnnotationManager();
annotations.add({
  spanId: 'span-42',
  content: 'This tool call returned unexpected results',
  author: 'alice',
  severity: 'warning',
  tags: ['review', 'tool-error'],
});
```

### Automated CI/CD Checks

```typescript
import { runCICDCheck } from '@reaatech/agent-replay-core';

const result = runCICDCheck(currentTrace, {
  baseline,
  failOnRegression: true,
  minSimilarity: 0.95,
  failOnAnomaly: true,
});

if (!result.passed) {
  console.error(result.formattedReport);
  process.exit(1);
}
```
