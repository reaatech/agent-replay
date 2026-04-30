import type { FrameworkStateAdapter, RecordingEngine } from '@reaatech/agent-replay-core';
import type { Event, Message, SerializedState } from '@reaatech/agent-replay-shared';

/**
 * Configuration for LangGraph integration.
 */
export interface LangGraphIntegrationConfig {
  recordingEngine: RecordingEngine;
  /** Node names that should trigger checkpoint creation */
  checkpointNodes?: string[];
}

/**
 * LangGraph-style state machine hooks that record state transitions
 * and create checkpoints at specified nodes.
 */
export interface LangGraphHooks {
  /** Called before a node executes. */
  beforeNode(nodeName: string, state: unknown, runId: string): void | Promise<void>;
  /** Called after a node executes. */
  afterNode(nodeName: string, state: unknown, output: unknown, runId: string): void | Promise<void>;
  /** Called when the graph enters a conditional edge. */
  onConditionalEdge(
    source: string,
    condition: string,
    target: string | string[],
    runId: string,
  ): void | Promise<void>;
  /** Called when the graph completes. */
  onComplete(finalState: unknown, runId: string): void | Promise<void>;
  /** Called when an error occurs in a node. */
  onError(nodeName: string, error: Error, runId: string): void | Promise<void>;
}

/**
 * Creates LangGraph-compatible hooks that record agent interactions
 * and optionally create checkpoints at specified nodes.
 */
export function createLangGraphHooks(config: LangGraphIntegrationConfig): LangGraphHooks {
  const engine = config.recordingEngine;
  const checkpointSet = new Set(config.checkpointNodes ?? []);
  const activeRuns = new Map<string, { nodeName: string; spanId: string }>();

  return {
    beforeNode(nodeName, state, runId) {
      if (!engine.isRecording) return;
      const spanId = engine.startSpan(nodeName, 'agent_step');
      activeRuns.set(runId, { nodeName, spanId });

      const event: Event = {
        timestamp: Date.now(),
        type: 'request',
        name: 'node_start',
        attributes: { nodeName, runId },
        data: { state: serializeForTrace(state) },
      };

      engine.captureEvent(event, { spanId, timestamp: event.timestamp });
    },

    afterNode(nodeName, state, output, runId) {
      if (!engine.isRecording) return;
      const run = activeRuns.get(runId);
      if (!run) return;

      const event: Event = {
        timestamp: Date.now(),
        type: 'response',
        name: 'node_end',
        attributes: { nodeName, runId },
        data: { output: serializeForTrace(output) },
      };

      engine.captureEvent(event, { spanId: run.spanId, timestamp: event.timestamp });
      engine.endSpan(run.spanId, 'ok');

      // Create checkpoint if this node is in the checkpoint list
      if (checkpointSet.has(nodeName)) {
        engine.createActiveSessionCheckpoint(state);
      }

      activeRuns.delete(runId);
    },

    onConditionalEdge(source, condition, target, runId) {
      if (!engine.isRecording) return;
      const spanId = engine.startSpan('routing', 'routing_decision');

      const event: Event = {
        timestamp: Date.now(),
        type: 'response',
        name: 'routing_decision',
        attributes: { runId },
        data: { source, condition, target },
      };

      engine.captureEvent(event, { spanId, timestamp: event.timestamp });
      engine.endSpan(spanId, 'ok');
    },

    onComplete(finalState, runId) {
      if (!engine.isRecording) return;
      const spanId = engine.startSpan('graph_complete', 'state_change');

      const event: Event = {
        timestamp: Date.now(),
        type: 'state_snapshot',
        name: 'graph_complete',
        attributes: { runId },
        data: { finalState: serializeForTrace(finalState) },
      };

      engine.captureEvent(event, { spanId, timestamp: event.timestamp });
      engine.endSpan(spanId, 'ok');
    },

    onError(nodeName, error, runId) {
      if (!engine.isRecording) return;
      const run = activeRuns.get(runId);
      const spanId = run?.spanId;

      const event: Event = {
        timestamp: Date.now(),
        type: 'error',
        name: 'node_error',
        attributes: { nodeName, runId },
        data: { message: error.message, stack: error.stack },
      };

      if (spanId) {
        engine.captureEvent(event, { spanId, timestamp: event.timestamp });
        engine.endSpan(spanId, 'error');
      } else {
        const newSpanId = engine.startSpan(`${nodeName}_error`, 'error');
        engine.captureEvent(event, { spanId: newSpanId, timestamp: event.timestamp });
        engine.endSpan(newSpanId, 'error');
      }

      activeRuns.delete(runId);
    },
  };
}

/**
 * FrameworkStateAdapter for LangGraph-style state objects.
 *
 * LangGraph state is typically a plain object with keyed values
 * representing the graph's channel values (messages, memories, counters, etc.).
 */
export const langgraphStateAdapter: FrameworkStateAdapter = {
  framework: 'langgraph',

  canHandle(state: unknown): boolean {
    if (typeof state !== 'object' || state === null) return false;
    const s = state as Record<string, unknown>;
    // LangGraph state usually has a messages array and/or channel values
    return (
      Array.isArray(s.messages) ||
      Array.isArray(s.chat_history) ||
      typeof s.__interrupts === 'object' ||
      typeof s.__metadata === 'object'
    );
  },

  capture(state: unknown): SerializedState {
    const s = state as Record<string, unknown>;

    // Extract messages from LangGraph's standard "messages" channel
    const messages: Message[] = [];
    if (Array.isArray(s.messages)) {
      for (const msg of s.messages) {
        const m = msg as Record<string, unknown>;
        if (typeof m.content === 'string') {
          messages.push({
            role: (m.role as Message['role']) ?? 'assistant',
            content: m.content,
            toolCalls: Array.isArray(m.tool_calls)
              ? m.tool_calls.map((tc: Record<string, unknown>) => ({
                  id: String(tc.id ?? ''),
                  name: String(tc.name ?? ''),
                  arguments: (tc.args as Record<string, unknown>) ?? {},
                }))
              : undefined,
          });
        }
      }
    }

    // Extract any tool definitions if present
    const tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }> =
      [];
    if (Array.isArray(s.tools)) {
      for (const tool of s.tools) {
        const t = tool as Record<string, unknown>;
        if (typeof t.name === 'string') {
          tools.push({
            name: t.name,
            description: typeof t.description === 'string' ? t.description : '',
            parameters:
              typeof t.parameters === 'object' && t.parameters !== null
                ? (t.parameters as Record<string, unknown>)
                : {},
          });
        }
      }
    }

    return {
      variables: extractGraphVariables(s),
      memory: { entries: [] },
      conversation: { messages },
      toolRegistry: { tools },
    };
  },

  restore(snapshot: SerializedState): unknown {
    return {
      messages: snapshot.conversation.messages.map((m) => ({
        role: m.role,
        content: m.content,
        tool_calls: m.toolCalls?.map((tc) => ({
          id: tc.id,
          name: tc.name,
          args: tc.arguments,
        })),
      })),
      tools: snapshot.toolRegistry.tools,
      ...snapshot.variables,
    };
  },
};

function serializeForTrace(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    if (typeof value === 'object' && value !== null) {
      return `[Object: ${value.constructor?.name ?? 'unknown'}]`;
    }
    return String(value);
  }
}

function extractGraphVariables(state: Record<string, unknown>): Record<string, unknown> {
  const vars: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (key === 'messages' || key === 'tools' || key === '__interrupts' || key === '__metadata')
      continue;
    vars[key] = value;
  }
  return vars;
}
