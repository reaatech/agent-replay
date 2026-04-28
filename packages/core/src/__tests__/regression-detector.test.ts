import { describe, it, expect } from 'vitest';
import type { Trace } from '@reaatech/shared';

import { RegressionDetector, formatRegressionReport } from '../regression-detector.js';

function createTrace(
  id: string,
  config: {
    spanCount: number;
    errorCount: number;
    duration: number;
    llmCalls: number;
    toolCalls?: string[];
  }
): Trace {
  const spans = [];
  for (let i = 0; i < config.llmCalls; i++) {
    spans.push({
      id: `llm-${i}`,
      name: `llm-${i}`,
      kind: 'llm_call' as const,
      startTime: i * 1000,
      endTime: (i + 1) * 1000,
      status: i < config.errorCount ? ('error' as const) : ('ok' as const),
      events: [
        {
          timestamp: (i + 1) * 1000,
          type: 'response' as const,
          name: 'resp',
          attributes: {},
          data: { content: 'response' },
        },
      ],
      attributes: {},
      links: [],
    });
  }

  if (config.toolCalls) {
    for (let i = 0; i < config.toolCalls.length; i++) {
      spans.push({
        id: `tool-${i}`,
        name: `tool-${i}`,
        kind: 'tool_call' as const,
        startTime: (config.llmCalls + i) * 1000,
        endTime: (config.llmCalls + i + 1) * 1000,
        status: 'ok' as const,
        events: [
          {
            timestamp: (config.llmCalls + i + 1) * 1000,
            type: 'request' as const,
            name: 'req',
            attributes: {},
            data: { name: config.toolCalls[i] },
          },
        ],
        attributes: {},
        links: [],
      });
    }
  }

  return {
    version: '1.0.0',
    metadata: {
      id,
      name: id,
      createdAt: Date.now(),
      agentVersion: '1.0.0',
      environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
      tags: [],
      summary: { id: 'test', name: 'test', spanCount: spans.length, duration: config.duration },
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

describe('RegressionDetector', () => {
  const detector = new RegressionDetector();

  it('should detect no regressions for identical traces', () => {
    const trace = createTrace('base', { spanCount: 2, errorCount: 0, duration: 2000, llmCalls: 2 });
    const report = detector.detect(trace, trace);

    expect(report.regressions).toHaveLength(0);
    expect(report.overallSeverity).toBe('none');
    expect(report.summary).toBe('No regressions detected.');
  });

  it('should detect error rate increase', () => {
    const baseline = createTrace('base', {
      spanCount: 4,
      errorCount: 0,
      duration: 4000,
      llmCalls: 4,
    });
    const current = createTrace('curr', {
      spanCount: 4,
      errorCount: 1,
      duration: 4000,
      llmCalls: 4,
    });
    const report = detector.detect(baseline, current);

    expect(report.regressions.some(r => r.type === 'error_rate_increase')).toBe(true);
    expect(report.overallSeverity).toBe('critical');
  });

  it('should detect duration increase', () => {
    const baseline = createTrace('base', {
      spanCount: 2,
      errorCount: 0,
      duration: 1000,
      llmCalls: 2,
    });
    const current = createTrace('curr', {
      spanCount: 2,
      errorCount: 0,
      duration: 3000,
      llmCalls: 2,
    });
    const report = detector.detect(baseline, current);

    expect(report.regressions.some(r => r.type === 'duration_increase')).toBe(true);
  });

  it('should detect LLM call count change', () => {
    const baseline = createTrace('base', {
      spanCount: 2,
      errorCount: 0,
      duration: 2000,
      llmCalls: 2,
    });
    const current = createTrace('curr', {
      spanCount: 3,
      errorCount: 0,
      duration: 3000,
      llmCalls: 3,
    });
    const report = detector.detect(baseline, current);

    expect(report.regressions.some(r => r.type === 'llm_call_count_change')).toBe(true);
  });

  it('should detect tool call sequence change', () => {
    const baseline = createTrace('base', {
      spanCount: 2,
      errorCount: 0,
      duration: 2000,
      llmCalls: 0,
      toolCalls: ['search', 'calculator'],
    });
    const current = createTrace('curr', {
      spanCount: 2,
      errorCount: 0,
      duration: 2000,
      llmCalls: 0,
      toolCalls: ['calculator', 'search'],
    });
    const report = detector.detect(baseline, current);

    expect(report.regressions.some(r => r.type === 'tool_call_sequence_change')).toBe(true);
  });

  it('should respect custom thresholds', () => {
    const strictDetector = new RegressionDetector({ durationIncreasePercent: 5 });
    const baseline = createTrace('base', {
      spanCount: 2,
      errorCount: 0,
      duration: 1000,
      llmCalls: 2,
    });
    const current = createTrace('curr', {
      spanCount: 2,
      errorCount: 0,
      duration: 1100,
      llmCalls: 2,
    });
    const report = strictDetector.detect(baseline, current);

    expect(report.regressions.some(r => r.type === 'duration_increase')).toBe(true);
  });
});

describe('formatRegressionReport', () => {
  it('should format a regression report', () => {
    const report = {
      baseline: 'base',
      current: 'curr',
      regressions: [
        {
          type: 'error_rate_increase',
          severity: 'critical' as const,
          message: 'Errors increased',
          metric: { name: 'error_rate', before: 0, after: 0.5, change: 0.5 },
        },
      ],
      overallSeverity: 'critical' as const,
      summary: 'Detected 1 regression(s): 1 critical.',
    };

    const formatted = formatRegressionReport(report);
    expect(formatted).toContain('Regression Report');
    expect(formatted).toContain('Errors increased');
    expect(formatted).toContain('critical');
  });
});
