# @reaatech/cli

Command-line interface for Agent Replay.

## Commands

| Command   | Description                                     |
| --------- | ----------------------------------------------- |
| `record`  | Record an agent interaction                     |
| `replay`  | Replay a recorded trace                         |
| `explore` | Explore a trace interactively                   |
| `diff`    | Compare two traces                              |
| `debug`   | Debug a trace with step-through and breakpoints |

## Usage

```bash
agent-replay record -o ./trace.artrace.json -n "my-run"
agent-replay replay -t ./trace.artrace.json -m stubbed
agent-replay explore -t ./trace.artrace.json
agent-replay diff -b ./baseline.artrace.json -c ./current.artrace.json
agent-replay debug -t ./trace.artrace.json -k llm_call -w "span.name"
```
