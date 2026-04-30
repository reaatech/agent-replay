# Migration Guide

## From Raw Logging

If you're currently using `console.log` or custom logging to debug agent interactions:

```typescript
// Before
console.log('LLM response:', response);

// After
import { RecordingEngine } from '@reaatech/agent-replay-core';
const engine = new RecordingEngine();
const session = engine.startRecording({ name: 'my-run', outputPath: './trace.artrace.json' });
// All LLM calls are captured automatically via interceptors
```

## From VCR/Polly (HTTP-level recording)

Agent Replay is higher-level than HTTP recording:

| Feature   | VCR/Polly             | Agent Replay                             |
| --------- | --------------------- | ---------------------------------------- |
| Records   | HTTP requests         | LLM calls, tool calls, routing decisions |
| Replays   | Exact HTTP responses  | Semantic replay with state restoration   |
| Debugging | Manual log inspection | Step-through debugger with breakpoints   |

Migration steps:

1. Replace HTTP mocks with `OpenAIInterceptor` or `AnthropicAdapter`
2. Add checkpoints at key decision points
3. Use partial replay for debugging

## Version Compatibility

Traces use semantic versioning (`major.minor.patch`).

- **Major version changes**: Breaking format changes, requires migration
- **Minor version changes**: New fields added, backward compatible
- **Patch version changes**: Bug fixes, no format changes

Use `migrateTrace` to upgrade legacy traces:

```typescript
import { migrateTrace } from '@reaatech/agent-replay-core';
const migrated = migrateTrace(oldTrace);
```
