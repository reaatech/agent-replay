import type { Trace } from '@reaatech/agent-replay-shared';
import { describe, expect, it } from 'vitest';

import { formatComparison, TraceComparator } from '../trace-comparison.js';

function createTrace(
  id: string,
  spans: Array<{ name: string; kind: string; status?: string; duration?: number }>,
): Trace {
  const time = 0;
  return {
    version: '1.0.0',
    metadata: {
      id,
      name: id,
      createdAt: Date.now(),
      agentVersion: '1.0.0',
      environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
      tags: [],
      summary: {
        id: 'test',
        name: 'test',
        spanCount: spans.length,
        duration: spans.reduce((s, sp) => s + (sp.duration ?? 1000), 0),
      },
    },
    spans: spans.map((s, i) => ({
      id: `span-${i}`,
      name: s.name,
      kind: s.kind as 'llm_call' | 'tool_call' | 'agent_step',
      startTime: time,
      endTime: time + (s.duration ?? 1000),
      status: (s.status as 'ok' | 'error') ?? 'ok',
      events: [],
      attributes: {},
      links: [],
    })),
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

describe('TraceComparator', () => {
  const comparator = new TraceComparator();

  it('should handle empty trace list', () => {
    const result = comparator.compare([]);
    expect(result.traceCount).toBe(0);
    expect(result.commonSpans).toHaveLength(0);
  });

  it('should find common spans across traces', () => {
    const t1 = createTrace('t1', [
      { name: 'greet', kind: 'llm_call' },
      { name: 'search', kind: 'tool_call' },
    ]);
    const t2 = createTrace('t2', [
      { name: 'greet', kind: 'llm_call' },
      { name: 'calc', kind: 'tool_call' },
    ]);

    const result = comparator.compare([t1, t2]);
    expect(result.commonSpans).toHaveLength(1);
    expect(result.commonSpans[0].name).toBe('greet');
  });

  it('should find unique spans per trace', () => {
    const t1 = createTrace('t1', [
      { name: 'greet', kind: 'llm_call' },
      { name: 'search', kind: 'tool_call' },
    ]);
    const t2 = createTrace('t2', [
      { name: 'greet', kind: 'llm_call' },
      { name: 'calc', kind: 'tool_call' },
    ]);

    const result = comparator.compare([t1, t2]);
    expect(result.uniqueSpans.get('t1')).toHaveLength(1);
    expect(result.uniqueSpans.get('t1')?.[0].name).toBe('search');
    expect(result.uniqueSpans.get('t2')?.[0].name).toBe('calc');
  });

  it('should compute duration stats', () => {
    const t1 = createTrace('t1', [{ name: 'a', kind: 'llm_call', duration: 1000 }]);
    const t2 = createTrace('t2', [{ name: 'a', kind: 'llm_call', duration: 3000 }]);

    const result = comparator.compare([t1, t2]);
    expect(result.durationStats.mean).toBe(2000);
    expect(result.durationStats.median).toBe(2000);
    expect(result.durationStats.min).toBe(1000);
    expect(result.durationStats.max).toBe(3000);
  });

  it('should compute error rates', () => {
    const t1 = createTrace('t1', [
      { name: 'a', kind: 'llm_call', status: 'ok' },
      { name: 'b', kind: 'llm_call', status: 'error' },
    ]);

    const result = comparator.compare([t1]);
    expect(result.errorRates.get('t1')).toBe(0.5);
  });

  it('should compute kind distribution', () => {
    const t1 = createTrace('t1', [
      { name: 'a', kind: 'llm_call' },
      { name: 'b', kind: 'llm_call' },
      { name: 'c', kind: 'tool_call' },
    ]);

    const result = comparator.compare([t1]);
    const dist = result.kindDistribution.get('t1');
    expect(dist).toBeDefined();
    if (!dist) throw new Error('unreachable');
    expect(dist.get('llm_call')).toBe(2);
    expect(dist.get('tool_call')).toBe(1);
  });

  it('should format comparison report', () => {
    const t1 = createTrace('t1', [{ name: 'a', kind: 'llm_call' }]);
    const result = comparator.compare([t1]);
    const formatted = formatComparison(result);
    expect(formatted).toContain('Trace Comparison Report');
    expect(formatted).toContain('Traces compared: 1');
  });

  it('should compute zero error rate for empty trace', () => {
    const t1 = createTrace('t1', []);
    const result = comparator.compare([t1]);
    expect(result.errorRates.get('t1')).toBe(0);
  });
});
