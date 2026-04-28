import type { RecordingEngine, FrameworkStateAdapter } from '@reaatech/core';
import type { SerializedState, Message, ToolCall, Event } from '@reaatech/shared';

/**
 * Configuration for LangChain integration.
 */
export interface LangChainIntegrationConfig {
  recordingEngine: RecordingEngine;
  captureState?: boolean;
}

/**
 * LangChain-style callback handler that records LLM calls, tool executions,
 * and chain steps into Agent Replay traces.
 *
 * This is designed to be compatible with LangChain's BaseCallbackHandler
 * interface without requiring LangChain as a runtime dependency.
 */
export interface LangChainCallbackHandler {
  /** Called when an LLM starts processing. */
  handleLLMStart(
    llm: { name: string; model: string },
    prompts: string[],
    runId: string
  ): void | Promise<void>;
  /** Called when an LLM produces output. */
  handleLLMEnd(
    output: {
      text: string;
      toolCalls?: ToolCall[];
      usage?: { prompt: number; completion: number; total: number };
    },
    runId: string
  ): void | Promise<void>;
  /** Called when a tool starts executing. */
  handleToolStart(
    tool: { name: string; description?: string; args: Record<string, unknown> },
    runId: string
  ): void | Promise<void>;
  /** Called when a tool finishes executing. */
  handleToolEnd(output: string, runId: string): void | Promise<void>;
  /** Called when a chain step begins. */
  handleChainStart(
    chain: { name: string },
    inputs: Record<string, unknown>,
    runId: string
  ): void | Promise<void>;
  /** Called when a chain step ends. */
  handleChainEnd(outputs: Record<string, unknown>, runId: string): void | Promise<void>;
  /** Called when an error occurs. */
  handleError(error: Error, runId: string): void | Promise<void>;
}

/**
 * Creates a LangChain-compatible callback handler that records agent interactions.
 */
export function createLangChainHandler(
  config: LangChainIntegrationConfig
): LangChainCallbackHandler {
  const engine = config.recordingEngine;
  const activeRuns = new Map<string, { spanName: string; kind: string; spanId: string }>();

  return {
    handleLLMStart(llm, _prompts, runId) {
      if (!engine.isRecording) return;
      const spanId = engine.startSpan(llm.name, 'llm_call');
      activeRuns.set(runId, { spanName: llm.name, kind: 'llm_call', spanId });
    },

    handleLLMEnd(output, runId) {
      if (!engine.isRecording) return;
      const run = activeRuns.get(runId);
      if (!run) return;

      const event: Event = {
        timestamp: Date.now(),
        type: 'response',
        name: 'llm_response',
        attributes: {
          model: run.spanName,
        },
        data: {
          content: output.text,
          toolCalls: output.toolCalls ?? [],
          usage: output.usage,
        },
      };

      engine.captureEvent(event, { spanId: run.spanId, timestamp: event.timestamp });
      engine.endSpan(run.spanId, 'ok');
      activeRuns.delete(runId);

      if (config.captureState) {
        engine.createActiveSessionCheckpoint({});
      }
    },

    handleToolStart(tool, runId) {
      if (!engine.isRecording) return;
      const spanId = engine.startSpan(tool.name, 'tool_call');
      activeRuns.set(runId, { spanName: tool.name, kind: 'tool_call', spanId });
    },

    handleToolEnd(output, runId) {
      if (!engine.isRecording) return;
      const run = activeRuns.get(runId);
      if (!run) return;

      const event: Event = {
        timestamp: Date.now(),
        type: 'response',
        name: 'tool_response',
        attributes: { toolName: run.spanName },
        data: { output },
      };

      engine.captureEvent(event, { spanId: run.spanId, timestamp: event.timestamp });
      engine.endSpan(run.spanId, 'ok');
      activeRuns.delete(runId);
    },

    handleChainStart(chain, inputs, runId) {
      if (!engine.isRecording) return;
      const spanId = engine.startSpan(chain.name, 'agent_step');
      activeRuns.set(runId, { spanName: chain.name, kind: 'agent_step', spanId });

      const event: Event = {
        timestamp: Date.now(),
        type: 'request',
        name: 'chain_start',
        attributes: { chainName: chain.name },
        data: { inputs },
      };

      engine.captureEvent(event, { spanId, timestamp: event.timestamp });
    },

    handleChainEnd(outputs, runId) {
      if (!engine.isRecording) return;
      const run = activeRuns.get(runId);
      if (!run) return;

      const event: Event = {
        timestamp: Date.now(),
        type: 'response',
        name: 'chain_end',
        attributes: { chainName: run.spanName },
        data: { outputs },
      };

      engine.captureEvent(event, { spanId: run.spanId, timestamp: event.timestamp });
      engine.endSpan(run.spanId, 'ok');
      activeRuns.delete(runId);
    },

    handleError(error, runId) {
      if (!engine.isRecording) return;
      const run = activeRuns.get(runId);
      const spanId = run?.spanId;

      const event: Event = {
        timestamp: Date.now(),
        type: 'error',
        name: 'execution_error',
        attributes: { runId },
        data: { message: error.message, stack: error.stack },
      };

      if (spanId) {
        engine.captureEvent(event, { spanId, timestamp: event.timestamp });
        engine.endSpan(spanId, 'error');
      } else {
        // Create a standalone error span if no active run
        const newSpanId = engine.startSpan('error', 'error');
        engine.captureEvent(event, { spanId: newSpanId, timestamp: event.timestamp });
        engine.endSpan(newSpanId, 'error');
      }

      activeRuns.delete(runId);
    },
  };
}

/**
 * FrameworkStateAdapter for LangChain-style state objects.
 *
 * LangChain state typically includes:
 * - `memory`: A memory object with `chat_history` or `buffer`
 * - `llm`: The LLM configuration
 * - `tools`: Available tool definitions
 * - `inputs` / `outputs`: Chain I/O
 */
export const langchainStateAdapter: FrameworkStateAdapter = {
  framework: 'langchain',

  canHandle(state: unknown): boolean {
    if (typeof state !== 'object' || state === null) return false;
    const s = state as Record<string, unknown>;
    // LangChain objects usually have these signatures
    return (
      typeof s.memory === 'object' ||
      Array.isArray(s.chat_history) ||
      typeof s.llm === 'object' ||
      Array.isArray(s.tools)
    );
  },

  capture(state: unknown): SerializedState {
    const s = state as Record<string, unknown>;

    // Extract messages from various LangChain memory formats
    const messages: Message[] = [];
    if (Array.isArray(s.chat_history)) {
      for (const msg of s.chat_history) {
        const m = msg as Record<string, unknown>;
        if (typeof m.content === 'string' && typeof m.role === 'string') {
          const role = m.role;
          const validRole: Message['role'] = ['system', 'user', 'assistant', 'tool'].includes(role)
            ? (role as Message['role'])
            : 'user';
          messages.push({ role: validRole, content: m.content });
        }
      }
    } else if (s.memory && typeof s.memory === 'object') {
      const mem = s.memory as Record<string, unknown>;
      if (Array.isArray(mem.chat_history)) {
        for (const msg of mem.chat_history) {
          const m = msg as Record<string, unknown>;
          if (typeof m.content === 'string' && typeof m.role === 'string') {
            const role = m.role;
            const validRole: Message['role'] = ['system', 'user', 'assistant', 'tool'].includes(
              role
            )
              ? (role as Message['role'])
              : 'user';
            messages.push({ role: validRole, content: m.content });
          }
        }
      } else if (typeof mem.buffer === 'string') {
        messages.push({ role: 'assistant', content: mem.buffer });
      }
    }

    // Extract tool definitions
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
      variables: extractVariables(s),
      memory: { entries: [] },
      conversation: { messages },
      toolRegistry: { tools },
    };
  },

  restore(snapshot: SerializedState): unknown {
    // Reconstruct a LangChain-compatible state object
    return {
      memory: {
        chat_history: snapshot.conversation.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      },
      tools: snapshot.toolRegistry.tools,
      variables: snapshot.variables,
    };
  },
};

function extractVariables(state: Record<string, unknown>): Record<string, unknown> {
  const vars: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    if (key === 'memory' || key === 'tools' || key === 'llm') continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      vars[key] = value;
    } else if (typeof value === 'object' && value !== null) {
      vars[key] = value;
    }
  }
  return vars;
}
