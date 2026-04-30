# @reaatech/agent-replay-web-ui

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/agent-replay/blob/main/LICENSE)

> **Status:** Planned — not yet implemented. This package is a placeholder and is not published to npm.

Web-based trace viewer for Agent Replay. Provides a visual interface for exploring recorded agent traces — span timelines, event inspection, checkpoint navigation, and diff visualization.

## Installation

_Package is not yet published._

## Planned Features

- Interactive span timeline with zoom, filter, and search
- Side-by-side diff view for comparing recorded vs replayed traces
- Checkpoint navigation with state inspection
- Streaming trace loading for large files (100k+ spans)
- Annotation editor for collaborative review
- Dark mode and responsive layout

## Current Alternatives

Trace exploration is available today via:

- **CLI**: `@reaatech/agent-replay-cli` — `explore`, `debug`, and `diff` commands
- **Programmatic API**: `@reaatech/agent-replay-core` — `ReplayDebugger`, `TraceSummarizer`, `TraceComparator`, `AnnotationManager`

## Related Packages

- [`@reaatech/agent-replay-core`](https://www.npmjs.com/package/@reaatech/agent-replay-core) — Recording and replay engine
- [`@reaatech/agent-replay-cli`](https://www.npmjs.com/package/@reaatech/agent-replay-cli) — Command-line interface
- [`@reaatech/agent-replay`](https://www.npmjs.com/package/@reaatech/agent-replay) — Convenience entry point

## License

[MIT](https://github.com/reaatech/agent-replay/blob/main/LICENSE)
