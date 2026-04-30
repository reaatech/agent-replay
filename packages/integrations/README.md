# @reaatech/agent-replay-integrations

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-replay-integrations.svg)](https://www.npmjs.com/package/@reaatech/agent-replay-integrations)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-replay/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-replay/ci.yml?branch=main&label=CI)](https://github.com/reaatech/agent-replay/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Framework integrations for Agent Replay. Provides callback handlers and state machine hooks for LangChain and LangGraph that record agent interactions into traces without modifying your framework code.

## Installation

```bash
npm install @reaatech/agent-replay-integrations
# or
pnpm add @reaatech/agent-replay-integrations
```

## Feature Overview

- **LangChain integration** — callback handler recording LLM calls, tool executions, chain steps, and errors
- **LangGraph integration** — state machine hooks recording node transitions, conditional edges, and graph completion
- **Automatic checkpoints** — LangGraph can create checkpoints at specified nodes for partial replay support
- **State adapters** — `FrameworkStateAdapter` implementations for capturing and restoring framework-specific state
- **No framework runtime dependency** — integrations are compatible with LangChain/LangGraph interfaces without requiring them as dependencies
- **Transparent recording** — wire hooks once at the integration boundary, no agent logic changes needed

## Supported Frameworks

| Framework | Integration | Pattern | State Adapter |
|-----------|-------------|---------|---------------|
| LangChain | `createLangChainHandler()` | Callback handler | `langchainStateAdapter` |
| LangGraph | `createLangGraphHooks()` | State machine hooks | `langgraphStateAdapter` |

## Quick Start

### LangChain

```typescript
import { RecordingEngine } from "@reaatech/agent-replay-core";
import { createLangChainHandler } from "@reaatech/agent-replay-integrations";

const engine = new RecordingEngine();
const handler = createLangChainHandler({
  recordingEngine: engine,
  captureState: true,
});

const session = engine.startRecording({ name: "langchain-run" });

// Pass the handler to your LangChain invocation
// Compatible with LangChain's BaseCallbackHandler interface
// Example: chain.invoke(input, { callbacks: [handler] })

const trace = engine.stopRecording(session);
```

### LangGraph

```typescript
import { RecordingEngine } from "@reaatech/agent-replay-core";
import { createLangGraphHooks } from "@reaatech/agent-replay-integrations";

const engine = new RecordingEngine();
const hooks = createLangGraphHooks({
  recordingEngine: engine,
  checkpointNodes: ["agent", "tools"],
});

// Wire hooks into your LangGraph execution lifecycle:
//   hooks.beforeNode(nodeName, state, runId)
//   hooks.afterNode(nodeName, state, output, runId)
//   hooks.onConditionalEdge(source, condition, target, runId)
//   hooks.onComplete(finalState, runId)
//   hooks.onError(nodeName, error, runId)
```

### State Adapters

Register state adapters for automated state capture and restoration:

```typescript
import { FrameworkAdapterRegistry } from "@reaatech/agent-replay-core";
import {
  langchainStateAdapter,
  langgraphStateAdapter,
} from "@reaatech/agent-replay-integrations";

const registry = new FrameworkAdapterRegistry();
registry.register(langchainStateAdapter);
registry.register(langgraphStateAdapter);
```

## API Reference

### LangChain Integration

#### `createLangChainHandler(config)`

Creates a callback handler compatible with LangChain's `BaseCallbackHandler` interface.

```typescript
const handler = createLangChainHandler({
  recordingEngine: engine,
  captureState: false, // optional, default: false
});
```

#### `LangChainCallbackHandler`

The handler interface with seven callback methods:

| Method | When Called | Recorded As |
|--------|------------|-------------|
| `handleLLMStart(llm, prompts, runId)` | LLM invocation begins | `llm_call` span |
| `handleLLMEnd(output, runId)` | LLM response received | Ends span with response event |
| `handleToolStart(tool, runId)` | Tool execution begins | `tool_call` span |
| `handleToolEnd(output, runId)` | Tool execution completes | Ends span with response event |
| `handleChainStart(chain, inputs, runId)` | Chain step begins | `agent_step` span |
| `handleChainEnd(outputs, runId)` | Chain step completes | Ends span with response event |
| `handleError(error, runId)` | Error occurs anywhere | `error` span with stack trace |

#### `LangChainIntegrationConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `recordingEngine` | `RecordingEngine` | (required) | The recording engine to capture into |
| `captureState` | `boolean` | `false` | Create checkpoints after each LLM response |

#### `langchainStateAdapter`

A `FrameworkStateAdapter` that captures and restores LangChain state objects. Handles:

- Chat history from `memory.chat_history` or `memory.buffer`
- Tool definitions from `tools` array
- Variables from the state object (excluding memory/tools/llm keys)
- Message extraction with role validation (`system`, `user`, `assistant`, `tool`)

### LangGraph Integration

#### `createLangGraphHooks(config)`

Creates state machine hooks for recording graph execution.

```typescript
const hooks = createLangGraphHooks({
  recordingEngine: engine,
  checkpointNodes: ["agent", "tools"], // optional
});
```

#### `LangGraphHooks`

| Hook | When Called | Recorded As |
|------|------------|-------------|
| `beforeNode(nodeName, state, runId)` | Node execution begins | `agent_step` span with state snapshot |
| `afterNode(nodeName, state, output, runId)` | Node execution completes | Ends span with output event; creates checkpoint if node is in `checkpointNodes` |
| `onConditionalEdge(source, condition, target, runId)` | Conditional edge evaluated | `routing_decision` span with source, condition, and target |
| `onComplete(finalState, runId)` | Graph execution completes | `state_change` span with final state snapshot |
| `onError(nodeName, error, runId)` | Error in a node | `error` span with message and stack trace |

#### `LangGraphIntegrationConfig`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `recordingEngine` | `RecordingEngine` | (required) | The recording engine to capture into |
| `checkpointNodes` | `string[]` | `[]` | Node names that should trigger automatic checkpoint creation |

#### `langgraphStateAdapter`

A `FrameworkStateAdapter` that captures and restores LangGraph state objects. Handles:

- Messages from the standard `messages` channel with tool call extraction
- Tool definitions from `tools` array
- Graph variables (excluding `messages`, `tools`, `__interrupts`, `__metadata`)
- State restoration compatible with LangGraph's channel-based state model

## Usage Patterns

### Full Integration Workflow

1. Create a `RecordingEngine` and start a recording session
2. Create framework hooks/handlers, passing the engine
3. Wire hooks into your framework's execution lifecycle
4. Run your agent as normal — recording is transparent
5. Stop the session and save the trace

No modifications to your agent's logic or framework code are required beyond wiring the hooks at the integration boundary.

### LangChain with Callbacks

```typescript
import { createLangChainHandler } from "@reaatech/agent-replay-integrations";

const handler = createLangChainHandler({ recordingEngine: engine });

// LangChain-style invocation
const result = await chain.invoke(
  { input: "What is 2+2?" },
  { callbacks: [handler] }
);

### LangGraph with Hooks

```typescript
import { createLangGraphHooks } from "@reaatech/agent-replay-integrations";

const hooks = createLangGraphHooks({
  recordingEngine: engine,
  checkpointNodes: ["agent"],
});

// Before each node execution:
await hooks.beforeNode("agent", state, runId);
// ... execute node ...
await hooks.afterNode("agent", newState, output, runId);
```

## Related Packages

- [`@reaatech/agent-replay-core`](https://www.npmjs.com/package/@reaatech/agent-replay-core) — Recording, replay, and debugging engine
- [`@reaatech/agent-replay-shared`](https://www.npmjs.com/package/@reaatech/agent-replay-shared) — Types, errors, and configuration
- [`@reaatech/agent-replay`](https://www.npmjs.com/package/@reaatech/agent-replay) — Convenience entry point re-exporting all packages

## License

[MIT](https://github.com/reaatech/agent-replay/blob/main/LICENSE)
