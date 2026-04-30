import type { ReplayResult, Trace } from '@reaatech/agent-replay-shared';
import { describe, expect, it } from 'vitest';

import { DivergenceDetector } from '../divergence-detector.js';

function createTrace(
  id: string,
  spans: Array<{ kind: string; content?: string; tool?: string }>,
): Trace {
  return {
    version: '1.0.0',
    metadata: {
      id,
      name: id,
      createdAt: Date.now(),
      agentVersion: '1.0.0',
      environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
      tags: [],
      summary: { id: 'test', name: 'test', spanCount: spans.length, duration: 1000 },
    },
    spans: spans.map((s, i) => ({
      id: `span-${i}`,
      name: `span-${i}`,
      kind: s.kind as 'llm_call' | 'tool_call' | 'agent_step',
      startTime: i * 1000,
      endTime: (i + 1) * 1000,
      status: 'ok',
      events: s.content
        ? [
            {
              timestamp: (i + 1) * 1000,
              type: 'response' as const,
              name: 'resp',
              attributes: {},
              data: { content: s.content },
            },
          ]
        : s.tool
          ? [
              {
                timestamp: (i + 1) * 1000,
                type: 'request' as const,
                name: 'req',
                attributes: {},
                data: { name: s.tool },
              },
            ]
          : [],
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

function createReplayResult(trace: Trace): ReplayResult {
  return {
    trace,
    outputs: [],
    duration: 1000,
  };
}

describe('DivergenceDetector', () => {
  const detector = new DivergenceDetector();

  it('should detect no divergence for identical traces', () => {
    const baseline = createTrace('base', [{ kind: 'llm_call', content: 'Hello' }]);
    const live = createReplayResult(createTrace('live', [{ kind: 'llm_call', content: 'Hello' }]));

    const result = detector.detect(baseline, live);
    expect(result).toBeNull();
  });

  it('should detect span count divergence', () => {
    const baseline = createTrace('base', [{ kind: 'llm_call', content: 'Hello' }]);
    const live = createReplayResult(
      createTrace('live', [
        { kind: 'llm_call', content: 'Hello' },
        { kind: 'llm_call', content: 'World' },
      ]),
    );

    const result = detector.detect(baseline, live);
    expect(result).not.toBeNull();
    expect(result?.spanDivergences.some((d) => d.spanId === 'meta')).toBe(true);
  });

  it('should detect LLM output divergence', () => {
    const baseline = createTrace('base', [{ kind: 'llm_call', content: 'Hello world' }]);
    const live = createReplayResult(
      createTrace('live', [{ kind: 'llm_call', content: 'Goodbye world' }]),
    );

    const result = detector.detect(baseline, live);
    expect(result).not.toBeNull();
    expect(result?.spanDivergences[0].severity).toBe('critical');
    expect(result?.similarity).toBeLessThan(1);
  });

  it('should detect kind mismatch as critical', () => {
    const baseline = createTrace('base', [{ kind: 'llm_call', content: 'Hello' }]);
    const live = createReplayResult(createTrace('live', [{ kind: 'tool_call', tool: 'search' }]));

    const result = detector.detect(baseline, live);
    expect(result).not.toBeNull();
    expect(result?.spanDivergences[0].severity).toBe('critical');
  });

  it('should detect tool call changes', () => {
    const baseline = createTrace('base', [{ kind: 'tool_call', tool: 'search' }]);
    const live = createReplayResult(
      createTrace('live', [{ kind: 'tool_call', tool: 'calculator' }]),
    );

    const result = detector.detect(baseline, live, { strictToolCallOrder: true });
    expect(result).not.toBeNull();
    expect(result?.spanDivergences[0].severity).toBe('high');
  });

  it('should respect configurable thresholds', () => {
    const baseline = createTrace('base', [
      { kind: 'llm_call', content: 'Hello world how are you' },
    ]);
    const live = createReplayResult(
      createTrace('live', [{ kind: 'llm_call', content: 'Hello world' }]),
    );

    // With high threshold, small changes are ignored
    const strict = detector.detect(baseline, live, { minOutputSimilarity: 0.99 });
    expect(strict).not.toBeNull();

    // With low threshold, same traces pass
    const lenient = detector.detect(baseline, live, { minOutputSimilarity: 0.3 });
    expect(lenient).toBeNull();
  });

  it('should detect routing decision divergence', () => {
    const baseline = createTrace('base', [{ kind: 'routing_decision' }]);
    baseline.spans[0].events = [
      {
        timestamp: 1000,
        type: 'response' as const,
        name: 'route',
        attributes: {},
        data: { path: 'A' },
      },
    ];
    const live = createReplayResult(createTrace('live', [{ kind: 'routing_decision' }]));
    live.trace.spans[0].events = [
      {
        timestamp: 1000,
        type: 'response' as const,
        name: 'route',
        attributes: {},
        data: { path: 'B' },
      },
    ];

    const result = detector.detect(baseline, live, { strictRouting: true });
    expect(result).not.toBeNull();
    expect(result?.spanDivergences[0].severity).toBe('medium');
  });

  it('should handle empty recorded trace', () => {
    const baseline = createTrace('base', []);
    const live = createReplayResult(createTrace('live', [{ kind: 'llm_call', content: 'Hello' }]));

    const result = detector.detect(baseline, live);
    expect(result).not.toBeNull();
    expect(result?.spanDivergences.length).toBeGreaterThan(0);
  });

  it('should classify very low similarity as critical', () => {
    const baseline = createTrace('base', [
      { kind: 'llm_call', content: 'completely different text here' },
    ]);
    const live = createReplayResult(
      createTrace('live', [{ kind: 'llm_call', content: 'xyz abc def ghi' }]),
    );

    const result = detector.detect(baseline, live, { minOutputSimilarity: 0.6 });
    expect(result).not.toBeNull();
    expect(result?.spanDivergences[0].severity).toBe('critical');
  });

  it('should handle missing tool names', () => {
    const baseline = createTrace('base', [{ kind: 'tool_call', tool: 'search' }]);
    const live = createReplayResult(createTrace('live', [{ kind: 'tool_call' }]));

    const result = detector.detect(baseline, live, { strictToolCallOrder: true });
    expect(result).not.toBeNull();
    expect(result?.spanDivergences[0].details).toContain('none');
  });

  it('should handle LLM spans without response content', () => {
    const baseline = createTrace('base', [{ kind: 'llm_call' }]);
    baseline.spans[0].events = [
      { timestamp: 1000, type: 'response' as const, name: 'resp', attributes: {}, data: {} },
    ];
    const live = createReplayResult(createTrace('live', [{ kind: 'llm_call', content: 'hello' }]));

    const result = detector.detect(baseline, live);
    expect(result).not.toBeNull();
    expect(result?.spanDivergences[0].severity).toBe('critical');
  });

  it('should handle empty text similarity', () => {
    const baseline = createTrace('base', [{ kind: 'llm_call', content: '' }]);
    const live = createReplayResult(createTrace('live', [{ kind: 'llm_call', content: 'hello' }]));

    const result = detector.detect(baseline, live);
    expect(result).not.toBeNull();
  });
});
