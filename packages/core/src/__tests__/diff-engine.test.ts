import type { ReplayResult, Trace } from '@reaatech/agent-replay-shared';
import { describe, expect, it } from 'vitest';

import { DiffEngine } from '../diff-engine.js';

function createTrace(id: string, spanCount: number, errorCount = 0): Trace {
  const spans = Array.from({ length: spanCount }, (_, i) => ({
    id: `span-${i}`,
    name: `span-${i}`,
    kind: 'llm_call' as const,
    startTime: Date.now(),
    status: i < errorCount ? ('error' as const) : ('ok' as const),
    events: [
      {
        timestamp: Date.now(),
        type: 'response' as const,
        name: 'response',
        attributes: {},
        data: { content: `output-${i}` },
      },
    ],
    attributes: {},
    links: [],
  }));

  return {
    version: '1.0.0',
    metadata: {
      id,
      name: 'Test',
      createdAt: Date.now(),
      agentVersion: '1.0.0',
      environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
      tags: [],
      summary: { id: 'test', name: 'test', spanCount, duration: 0 },
    },
    spans,
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

describe('DiffEngine', () => {
  const engine = new DiffEngine();

  it('should detect no differences for identical traces', () => {
    const trace = createTrace('base', 2);
    const result: ReplayResult = {
      trace: createTrace('replay', 2),
      outputs: [{ content: 'output-0' }, { content: 'output-1' }],
      duration: 0,
    };

    const diff = engine.compare(trace, result, {});
    expect(diff.severity).toBe('none');
    expect(diff.statistics.totalDifferences).toBe(0);
  });

  it('should detect structural differences in span count', () => {
    const trace = createTrace('base', 2);
    const result: ReplayResult = {
      trace: createTrace('replay', 3),
      outputs: [],
      duration: 0,
    };

    const diff = engine.compare(trace, result, {});
    expect(diff.severity).toBe('high');
    expect(diff.diffs.some((d) => d.type === 'structural.span_count')).toBe(true);
  });

  it('should detect error count changes', () => {
    const trace = createTrace('base', 2, 0);
    const result: ReplayResult = {
      trace: createTrace('replay', 2, 1),
      outputs: [],
      duration: 0,
    };

    const diff = engine.compare(trace, result, {});
    expect(diff.severity).toBe('critical');
    expect(diff.diffs.some((d) => d.type === 'structural.error_count')).toBe(true);
  });

  it('should detect semantic differences in LLM outputs', () => {
    const trace = createTrace('base', 1);
    const result: ReplayResult = {
      trace: createTrace('replay', 1),
      outputs: [{ content: 'different-output' }],
      duration: 0,
    };

    const diff = engine.compare(trace, result, {});
    expect(diff.diffs.some((d) => d.type === 'semantic.llm_output')).toBe(true);
  });
});
