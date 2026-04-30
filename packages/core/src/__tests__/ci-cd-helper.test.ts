import type { Trace } from '@reaatech/agent-replay-shared';
import { describe, expect, it } from 'vitest';

import { runCICDCheck } from '../ci-cd-helper.js';

function createTrace(
  id: string,
  spans: Array<{ name: string; kind: string; status?: string }>,
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
      summary: { id: 'test', name: 'test', spanCount: spans.length, duration: spans.length * 1000 },
    },
    spans: spans.map((s, i) => ({
      id: `span-${i}`,
      name: s.name,
      kind: s.kind as 'llm_call' | 'tool_call',
      startTime: time,
      endTime: time + 1000,
      status: (s.status as 'ok' | 'error') ?? 'ok',
      events: [
        {
          timestamp: time,
          type: 'response' as const,
          name: 'resp',
          attributes: {},
          data: { content: 'test' },
        },
      ],
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

describe('runCICDCheck', () => {
  const baseline = createTrace('baseline', [
    { name: 'a', kind: 'llm_call' },
    { name: 'b', kind: 'tool_call' },
  ]);

  it('should pass when traces are identical', () => {
    const result = runCICDCheck(baseline, { baseline });
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('should fail on regression when enabled', () => {
    const current = createTrace('current', [
      { name: 'a', kind: 'llm_call' },
      { name: 'b', kind: 'tool_call', status: 'error' },
    ]);

    const result = runCICDCheck(current, { baseline, failOnRegression: true });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes('regression'))).toBe(true);
  });

  it('should fail on low similarity when threshold set', () => {
    const current = createTrace('current', [
      { name: 'x', kind: 'tool_call' },
      { name: 'y', kind: 'tool_call' },
    ]);

    const result = runCICDCheck(current, { baseline, minSimilarity: 0.99 });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes('similarity'))).toBe(true);
  });

  it('should fail on anomaly when enabled', () => {
    const current = createTrace('current', [
      { name: 'a', kind: 'llm_call', status: 'error' },
      { name: 'b', kind: 'llm_call', status: 'error' },
      { name: 'c', kind: 'llm_call', status: 'error' },
    ]);

    const result = runCICDCheck(current, { baseline, failOnAnomaly: true });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes('anomaly'))).toBe(true);
  });

  it('should fail on divergence when enabled', () => {
    const current = createTrace('current', [
      { name: 'a', kind: 'tool_call' },
      { name: 'b', kind: 'llm_call' },
    ]);

    const result = runCICDCheck(current, { baseline, failOnDivergence: true });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes('Divergence'))).toBe(true);
  });

  it('should include formatted report', () => {
    const result = runCICDCheck(baseline, {
      baseline,
      labels: { baseline: 'v1.0', current: 'v1.1' },
    });
    expect(result.formattedReport).toContain('Agent Replay CI/CD Report');
    expect(result.formattedReport).toContain('v1.0');
    expect(result.formattedReport).toContain('v1.1');
  });

  it('should not fail when checks are disabled', () => {
    const current = createTrace('current', [
      { name: 'a', kind: 'llm_call' },
      { name: 'b', kind: 'tool_call', status: 'error' },
    ]);

    const result = runCICDCheck(current, { baseline });
    expect(result.passed).toBe(true);
  });
});
