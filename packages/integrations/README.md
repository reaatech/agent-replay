# @reaatech/integrations

Framework integrations for Agent Replay.

## Features

- **LangChain** — Callback handler that records LLM calls, tool executions, and chain steps
- **LangGraph** — State machine hooks for recording node transitions and conditional edges
- **FrameworkStateAdapter** implementations for state capture and restoration

## Usage

```typescript
import { createLangChainHandler, langchainStateAdapter } from '@reaatech/integrations';
import { RecordingEngine, FrameworkAdapterRegistry } from '@reaatech/core';

const engine = new RecordingEngine();
const handler = createLangChainHandler({ recordingEngine: engine });

// Register state adapter
const registry = new FrameworkAdapterRegistry();
registry.register(langchainStateAdapter);
```
