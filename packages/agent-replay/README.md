# @reaatech/agent-replay

Main package for Agent Replay. Re-exports `@reaatech/core` and `@reaatech/interceptors` for convenience.

## Installation

```bash
npm install @reaatech/agent-replay
```

## Usage

```typescript
import { RecordingEngine, ReplayEngine, OpenAIInterceptor } from '@reaatech/agent-replay';
```

For granular control, you can install individual packages:

- `@reaatech/core` — Recording/replay engine
- `@reaatech/interceptors` — LLM provider interceptors
- `@reaatech/cli` — Command-line interface
- `@reaatech/integrations` — Framework integrations
- `@reaatech/shared` — Shared types and utilities
