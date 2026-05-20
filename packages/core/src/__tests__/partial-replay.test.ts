import type { Span, Trace } from '@reaatech/agent-replay-shared';
import { ReplayFailedError } from '@reaatech/agent-replay-shared';
import { afterEach, describe, expect, it } from 'vitest';

import { PartialReplayOrchestrator } from '../partial-replay.js';

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
      summary: { id: 'test', name: 'test', spanCount: 3, duration: 3000 },
    },
    spans: [
      {
        id: 'span-1',
        name: 'llm-1',
        kind: 'llm_call',
        startTime: 0,
        endTime: 1000,
        status: 'ok',
        events: [
          {
            timestamp: 1000,
            type: 'response' as const,
            name: 'resp',
            attributes: {},
            data: { content: 'step1' },
          },
        ],
        attributes: {},
        links: [],
      },
      {
        id: 'span-2',
        name: 'tool-1',
        kind: 'tool_call',
        startTime: 1000,
        endTime: 2000,
        status: 'ok',
        events: [],
        attributes: {},
        links: [],
      },
      {
        id: 'span-3',
        name: 'llm-2',
        kind: 'llm_call',
        startTime: 2000,
        endTime: 3000,
        status: 'ok',
        events: [
          {
            timestamp: 3000,
            type: 'response' as const,
            name: 'resp',
            attributes: {},
            data: { content: 'step3' },
          },
        ],
        attributes: {},
        links: [],
      },
    ],
    checkpoints: [
      {
        id: 'cp-after-tool',
        spanId: 'span-2',
        timestamp: 2000,
        state: {
          variables: {},
          memory: { entries: [] },
          conversation: { messages: [] },
          toolRegistry: { tools: [] },
        },
        context: { sessionId: 'test', variables: {} },
        metadata: { name: 'after-tool' },
      },
    ],
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

describe('PartialReplayOrchestrator', () => {
  const orchestrator = new PartialReplayOrchestrator();

  afterEach(() => {
    orchestrator.cleanup();
  });

  it('should find a checkpoint by ID', () => {
    const trace = createTestTrace();
    const cp = orchestrator.findCheckpoint(trace, 'cp-after-tool');
    expect(cp.id).toBe('cp-after-tool');
    expect(cp.spanId).toBe('span-2');
  });

  it('should throw for missing checkpoint', () => {
    const trace = createTestTrace();
    expect(() => orchestrator.findCheckpoint(trace, 'missing')).toThrow(ReplayFailedError);
  });

  it('should find checkpoint span index', () => {
    const trace = createTestTrace();
    const cp = orchestrator.findCheckpoint(trace, 'cp-after-tool');
    const index = orchestrator.findCheckpointSpanIndex(trace, cp);
    expect(index).toBe(1);
  });

  it('should replay slice up to checkpoint', () => {
    const trace = createTestTrace();
    const result = orchestrator.replaySlice(trace, 0, 1);

    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]).toEqual({ content: 'step1' });
    expect(result.lastIndex).toBe(1);
  });

  it('should replay full trace slice', () => {
    const trace = createTestTrace();
    const result = orchestrator.replaySlice(trace, 0, 2);

    expect(result.outputs).toHaveLength(2);
    expect(result.outputs[0]).toEqual({ content: 'step1' });
    expect(result.outputs[1]).toEqual({ content: 'step3' });
  });

  it('should call progress callback during slice replay', () => {
    const trace = createTestTrace();
    const progress: Array<{ percent: number; currentStep: number; totalSteps: number }> = [];

    orchestrator.replaySlice(trace, 0, 2, (p) => progress.push(p));

    expect(progress).toHaveLength(3);
    expect(progress[2].percent).toBe(100);
  });

  it('should execute partial replay workflow', async () => {
    const trace = createTestTrace();

    const liveResult = await orchestrator.partialReplay(
      trace,
      'cp-after-tool',
      { mode: 'stubbed' },
      (spans: Span[]) => {
        return Promise.resolve({
          trace,
          outputs: spans.map(() => ({ content: 'live' })),
          duration: 100,
        });
      },
    );

    // Should have stubbed output (step1) + live outputs
    expect(liveResult.outputs.length).toBeGreaterThan(0);
  });
});
