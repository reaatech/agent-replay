import { ReplayFailedError } from '@reaatech/agent-replay-shared';
import type {
  Checkpoint,
  DiffReplayConfig,
  PartialReplayConfig,
  Trace,
} from '@reaatech/agent-replay-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReplayEngine } from '../replay-engine.js';

function createTestTrace(): Trace {
  return {
    version: '1.0.0',
    metadata: {
      id: 'test-trace',
      name: 'Test',
      createdAt: Date.now(),
      agentVersion: '1.0.0',
      environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
      tags: [],
      summary: { id: 'test', name: 'test', spanCount: 0, duration: 0 },
    },
    spans: [
      {
        id: 'span-1',
        name: 'llm-call',
        kind: 'llm_call',
        startTime: Date.now(),
        status: 'ok',
        events: [
          {
            timestamp: Date.now(),
            type: 'response' as const,
            name: 'llm-response',
            attributes: {},
            data: { content: 'Hello' },
          },
        ],
        attributes: {},
        links: [],
      },
    ],
    checkpoints: [],
    indexes: {
      byId: {},
      byKind: {
        llm_call: [],
        tool_call: [],
        agent_step: [],
        routing_decision: [],
        state_change: [],
        error: [],
      },
    },
  };
}

function createEmptyTrace(): Trace {
  return {
    version: '1.0.0',
    metadata: {
      id: 'empty-trace',
      name: 'Empty',
      createdAt: Date.now(),
      agentVersion: '1.0.0',
      environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
      tags: [],
      summary: { id: 'test', name: 'test', spanCount: 0, duration: 0 },
    },
    spans: [],
    checkpoints: [],
    indexes: {
      byId: {},
      byKind: {
        llm_call: [],
        tool_call: [],
        agent_step: [],
        routing_decision: [],
        state_change: [],
        error: [],
      },
    },
  };
}

function createMultiSpanTrace(): Trace {
  return {
    version: '1.0.0',
    metadata: {
      id: 'multi-trace',
      name: 'Multi',
      createdAt: Date.now(),
      agentVersion: '1.0.0',
      environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
      tags: [],
      summary: { id: 'test', name: 'test', spanCount: 3, duration: 0 },
    },
    spans: [
      {
        id: 'span-1',
        name: 'llm-call-1',
        kind: 'llm_call',
        startTime: Date.now(),
        status: 'ok',
        events: [
          {
            timestamp: Date.now(),
            type: 'response' as const,
            name: 'llm-response',
            attributes: {},
            data: { content: 'First' },
          },
        ],
        attributes: {},
        links: [],
      },
      {
        id: 'span-2',
        name: 'tool-call',
        kind: 'tool_call',
        startTime: Date.now(),
        status: 'ok',
        events: [
          {
            timestamp: Date.now(),
            type: 'request' as const,
            name: 'tool-request',
            attributes: {},
            data: { tool: 'search' },
          },
        ],
        attributes: {},
        links: [],
      },
      {
        id: 'span-3',
        name: 'llm-call-2',
        kind: 'llm_call',
        startTime: Date.now(),
        status: 'ok',
        events: [
          {
            timestamp: Date.now(),
            type: 'request' as const,
            name: 'llm-request',
            attributes: {},
            data: { prompt: 'Hello' },
          },
        ],
        attributes: {},
        links: [],
      },
    ],
    checkpoints: [],
    indexes: {
      byId: {},
      byKind: {
        llm_call: [],
        tool_call: [],
        agent_step: [],
        routing_decision: [],
        state_change: [],
        error: [],
      },
    },
  };
}

function createTraceWithCheckpoint(checkpointId: string, checkpointSpanId: string): Trace {
  const checkpoint: Checkpoint = {
    id: checkpointId,
    spanId: checkpointSpanId,
    timestamp: Date.now(),
    state: {
      variables: {},
      memory: { entries: [] },
      conversation: { messages: [] },
      toolRegistry: { tools: [] },
    },
    context: {
      sessionId: 'session-1',
      variables: {},
    },
    metadata: {
      name: 'cp-1',
    },
  };

  return {
    version: '1.0.0',
    metadata: {
      id: 'checkpoint-trace',
      name: 'Checkpoint',
      createdAt: Date.now(),
      agentVersion: '1.0.0',
      environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
      tags: [],
      summary: { id: 'test', name: 'test', spanCount: 2, duration: 0 },
    },
    spans: [
      {
        id: 'span-1',
        name: 'llm-call-1',
        kind: 'llm_call',
        startTime: Date.now(),
        status: 'ok',
        events: [
          {
            timestamp: Date.now(),
            type: 'response' as const,
            name: 'llm-response',
            attributes: {},
            data: { content: 'Before checkpoint' },
          },
        ],
        attributes: {},
        links: [],
      },
      {
        id: checkpointSpanId,
        name: 'llm-call-2',
        kind: 'llm_call',
        startTime: Date.now(),
        status: 'ok',
        events: [
          {
            timestamp: Date.now(),
            type: 'response' as const,
            name: 'llm-response',
            attributes: {},
            data: { content: 'At checkpoint' },
          },
        ],
        attributes: {},
        links: [],
      },
    ],
    checkpoints: [checkpoint],
    indexes: {
      byId: {},
      byKind: {
        llm_call: [],
        tool_call: [],
        agent_step: [],
        routing_decision: [],
        state_change: [],
        error: [],
      },
    },
  };
}

describe('ReplayEngine', () => {
  let engine: ReplayEngine;

  beforeEach(() => {
    engine = new ReplayEngine();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('stubbed mode', () => {
    it('should replay trace in stubbed mode', () => {
      const trace = createTestTrace();
      const result = engine.replay(trace, { mode: 'stubbed' });

      expect(result.outputs).toHaveLength(1);
      expect(result.outputs[0]).toEqual({ content: 'Hello' });
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle trace with no spans', () => {
      const trace = createEmptyTrace();
      const result = engine.replay(trace, { mode: 'stubbed' });

      expect(result.outputs).toHaveLength(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should skip non-llm_call spans and spans without response events', () => {
      const trace = createMultiSpanTrace();
      const result = engine.replay(trace, { mode: 'stubbed' });

      // span-1 has response, span-2 is tool_call, span-3 has request but no response
      expect(result.outputs).toHaveLength(1);
      expect(result.outputs[0]).toEqual({ content: 'First' });
    });

    it('should call progress callback for each step in stubbed mode', () => {
      const trace = createMultiSpanTrace();
      const progress: Array<{ percent: number; currentStep: number; totalSteps: number }> = [];

      engine.replay(trace, {
        mode: 'stubbed',
        onProgress: (p) => progress.push(p),
      });

      expect(progress).toHaveLength(3);
      expect(progress[0]).toEqual({ percent: 33, currentStep: 1, totalSteps: 3 });
      expect(progress[1]).toEqual({ percent: 67, currentStep: 2, totalSteps: 3 });
      expect(progress[2]).toEqual({ percent: 100, currentStep: 3, totalSteps: 3 });
    });
  });

  describe('live mode', () => {
    it('should throw without interceptors installed', () => {
      const trace = createTestTrace();
      expect(() => engine.replay(trace, { mode: 'live' })).toThrow(ReplayFailedError);
    });

    it('should throw for empty trace without interceptors', () => {
      const trace = createEmptyTrace();
      expect(() => engine.replay(trace, { mode: 'live' })).toThrow(ReplayFailedError);
    });
  });

  describe('partial mode', () => {
    it('should replay up to checkpoint and combine outputs', () => {
      const trace = createTraceWithCheckpoint('cp-1', 'span-2');
      const result = engine.replay(trace, {
        mode: 'partial',
        checkpointId: 'cp-1',
      } as PartialReplayConfig);

      expect(result.outputs.length).toBeGreaterThanOrEqual(2);
      expect(result.outputs[0]).toEqual({ content: 'Before checkpoint' });
      expect(result.outputs[1]).toEqual({ content: 'At checkpoint' });
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should fail partial replay with missing checkpoint', () => {
      const trace = createTestTrace();
      expect(() =>
        engine.replay(trace, {
          mode: 'partial',
          checkpointId: 'missing',
        } as PartialReplayConfig),
      ).toThrow(ReplayFailedError);
    });

    it('should call progress callback during partial replay', () => {
      const trace = createTraceWithCheckpoint('cp-1', 'span-2');
      const progress: Array<{ percent: number; currentStep: number; totalSteps: number }> = [];

      engine.replay(trace, {
        mode: 'partial',
        checkpointId: 'cp-1',
        onProgress: (p) => progress.push(p),
      } as PartialReplayConfig);

      // partialReplay calls stubbedReplay then liveReplay, each reporting progress
      expect(progress.length).toBeGreaterThan(0);
    });
  });

  describe('diff mode', () => {
    it('should throw without interceptors installed in diff mode', () => {
      const trace = createTestTrace();
      expect(() => engine.replay(trace, { mode: 'diff' } as DiffReplayConfig)).toThrow(
        ReplayFailedError,
      );
    });

    it('should throw for empty trace without interceptors in diff mode', () => {
      const trace = createEmptyTrace();
      expect(() => engine.replay(trace, { mode: 'diff' } as DiffReplayConfig)).toThrow(
        ReplayFailedError,
      );
    });
  });

  describe('edge cases', () => {
    it('should throw on unknown replay mode', () => {
      const trace = createTestTrace();
      expect(() => engine.replay(trace, { mode: 'unknown' as 'stubbed' })).toThrow(
        ReplayFailedError,
      );
    });

    it('should throw ReplayFailedError with correct message for unknown mode', () => {
      const trace = createTestTrace();
      expect(() => engine.replay(trace, { mode: 'magic' as 'stubbed' })).toThrow(
        'Unknown replay mode: magic',
      );
    });

    it('should not call progress callback when not provided', () => {
      const trace = createTestTrace();
      // Should not throw when onProgress is undefined
      expect(() => engine.replay(trace, { mode: 'stubbed' })).not.toThrow();
    });

    it('should handle trace with span having no events', () => {
      const trace: Trace = {
        ...createTestTrace(),
        spans: [
          {
            id: 'span-empty',
            name: 'empty-span',
            kind: 'llm_call',
            startTime: Date.now(),
            status: 'ok',
            events: [],
            attributes: {},
            links: [],
          },
        ],
      };

      const result = engine.replay(trace, { mode: 'stubbed' });
      expect(result.outputs).toHaveLength(0);
    });
  });
});
