# @reaatech/agent-replay-cli

[![npm version](https://img.shields.io/npm/v/@reaatech/agent-replay-cli.svg)](https://www.npmjs.com/package/@reaatech/agent-replay-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-replay/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/agent-replay/ci.yml?branch=main&label=CI)](https://github.com/reaatech/agent-replay/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Command-line interface for recording, replaying, debugging, and comparing AI agent traces. Provides five subcommands covering the full Agent Replay workflow.

## Installation

```bash
npm install -g @reaatech/agent-replay-cli
# or
pnpm add -g @reaatech/agent-replay-cli
```

Or run without installing:

```bash
npx @reaatech/agent-replay-cli record -o ./traces/
```

## Feature Overview

- **record** — capture agent interactions and save to `.artrace.json` files
- **replay** — replay traces in stubbed, live, partial, or diff modes
- **explore** — interactively browse spans, events, and checkpoints
- **diff** — compare two traces with structural and semantic analysis
- **debug** — step-through debugging with breakpoints and watchpoints

## Quick Start

```bash
# Record an agent interaction
agent-replay record -o ./trace.artrace.json -n "production-run" --tags production,v1.2.0

# Replay with zero token cost
agent-replay replay -t ./trace.artrace.json -m stubbed

# Explore a trace
agent-replay explore -t ./trace.artrace.json

# Diff two traces
agent-replay diff -b ./baseline.artrace.json -c ./current.artrace.json

# Debug with breakpoints
agent-replay debug -t ./trace.artrace.json -k llm_call -w "span.name"
```

## Commands

### `record`

Capture an agent interaction and save as a trace file.

```bash
agent-replay record -o ./trace.artrace.json -n "my-run"
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-o, --output <path>` | `string` | `./trace.artrace.json` | Output file path |
| `-n, --name <name>` | `string` | — | Name for the recording session |
| `--tags <tags>` | `string` | — | Comma-separated tags |
| `--capture-state` | `boolean` | `false` | Enable state capture checkpoints |
| `--checkpoint-interval <n>` | `number` | — | Create checkpoints every N spans |

### `replay`

Replay a recorded trace in one of four modes.

```bash
# Stubbed replay (zero tokens)
agent-replay replay -t ./trace.artrace.json -m stubbed

# Live replay (requires interceptors installed)
agent-replay replay -t ./trace.artrace.json -m live

# Partial replay — replay to checkpoint CP, then go live
agent-replay replay -t ./trace.artrace.json -m partial -c cp-3

# Diff mode — compare live output against recorded trace
agent-replay replay -t ./trace.artrace.json -m diff
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-t, --trace <path>` | `string` | (required) | Path to the `.artrace.json` trace file |
| `-m, --mode <mode>` | `string` | `stubbed` | Replay mode: `stubbed`, `live`, `partial`, `diff` |
| `-c, --checkpoint <id>` | `string` | — | Checkpoint ID (required for `partial` mode) |
| `--max-steps <n>` | `number` | — | Maximum replay steps |
| `--timeout <ms>` | `number` | — | Timeout in milliseconds |

### `explore`

Interactively explore a trace.

```bash
agent-replay explore -t ./trace.artrace.json
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-t, --trace <path>` | `string` | (required) | Path to the trace file |
| `--list-spans` | `boolean` | `false` | List all spans with kinds and status |
| `--span <id>` | `string` | — | Inspect a specific span by ID |
| `--kind <kind>` | `string` | — | Filter spans by kind |
| `--events` | `boolean` | `false` | Show all events across spans |
| `--checkpoints` | `boolean` | `false` | List all checkpoints |

### `diff`

Compare two traces and produce a detailed diff report.

```bash
agent-replay diff -b ./baseline.artrace.json -c ./current.artrace.json
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-b, --baseline <path>` | `string` | (required) | Path to the baseline (expected) trace |
| `-c, --current <path>` | `string` | (required) | Path to the current (actual) trace |
| `--semantic` | `boolean` | `true` | Include semantic comparison |
| `--structural` | `boolean` | `true` | Include structural comparison |
| `--json` | `boolean` | `false` | Output as JSON instead of formatted report |

### `debug`

Step-through debugging with breakpoints and watchpoints.

```bash
agent-replay debug -t ./trace.artrace.json
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-t, --trace <path>` | `string` | (required) | Path to the trace file |
| `-k, --break-on-kind <kind>` | `string` | — | Pause on spans of this kind |
| `-n, --break-on-name <name>` | `string` | — | Pause on spans matching this name or regex |
| `-s, --break-on-step <n>` | `number` | — | Pause at a specific step index |
| `-w, --watch <expr>` | `string` | — | Watch a variable expression (dot-notation) |

## Programmatic API

All commands are also available as a library:

```typescript
import {
  record,
  replay,
  explore,
  diff,
  debug,
  type RecordOptions,
  type ReplayOptions,
  type ExploreOptions,
  type DiffOptions,
  type DebugOptions,
} from "@reaatech/agent-replay-cli";

await record({ outputPath: "./trace.artrace.json", name: "my-run" });
await replay({ tracePath: "./trace.artrace.json", mode: "stubbed" });
```

## Related Packages

- [`@reaatech/agent-replay-core`](https://www.npmjs.com/package/@reaatech/agent-replay-core) — Recording, replay, and debugging engine
- [`@reaatech/agent-replay-interceptors`](https://www.npmjs.com/package/@reaatech/agent-replay-interceptors) — LLM provider interceptors
- [`@reaatech/agent-replay-integrations`](https://www.npmjs.com/package/@reaatech/agent-replay-integrations) — Framework integrations
- [`@reaatech/agent-replay`](https://www.npmjs.com/package/@reaatech/agent-replay) — Convenience entry point re-exporting all packages

## License

[MIT](https://github.com/reaatech/agent-replay/blob/main/LICENSE)
