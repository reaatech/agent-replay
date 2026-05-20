import type { Trace } from '@reaatech/agent-replay-shared';
import { describe, expect, it } from 'vitest';

import { formatSemanticDiff, SemanticDiffEngine } from '../semantic-diff.js';

function createTrace(id: string, contents: string[]): Trace {
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
        spanCount: contents.length,
        duration: contents.length * 1000,
      },
    },
    spans: contents.map((content, i) => ({
      id: `span-${i}`,
      name: `span-${i}`,
      kind: 'llm_call' as const,
      startTime: i * 1000,
      endTime: (i + 1) * 1000,
      status: 'ok',
      events: content
        ? [
            {
              timestamp: (i + 1) * 1000,
              type: 'response',
              name: 'resp',
              attributes: {},
              data: { content },
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

function createToolTrace(
  id: string,
  calls: Array<{ name?: string; arguments?: Record<string, unknown> } | null>,
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
      summary: { id: 'test', name: 'test', spanCount: calls.length, duration: calls.length * 1000 },
    },
    spans: calls.map((call, i) => ({
      id: `span-${i}`,
      name: `span-${i}`,
      kind: 'tool_call' as const,
      startTime: i * 1000,
      endTime: (i + 1) * 1000,
      status: 'ok',
      events:
        call !== null
          ? [
              {
                timestamp: (i + 1) * 1000,
                type: 'request' as const,
                name: 'req',
                attributes: {},
                data: call,
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

function createRoutingTrace(id: string, decisions: unknown[]): Trace {
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
        spanCount: decisions.length,
        duration: decisions.length * 1000,
      },
    },
    spans: decisions.map((decision, i) => ({
      id: `span-${i}`,
      name: `span-${i}`,
      kind: 'routing_decision' as const,
      startTime: i * 1000,
      endTime: (i + 1) * 1000,
      status: 'ok',
      events:
        decision !== undefined
          ? [
              {
                timestamp: (i + 1) * 1000,
                type: 'response',
                name: 'resp',
                attributes: {},
                data: decision,
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

function createLLMTraceWithToolCalls(
  id: string,
  spans: Array<{ content?: string; toolCalls?: unknown[]; startTime?: number; endTime?: number }>,
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
      summary: { id: 'test', name: 'test', spanCount: spans.length, duration: spans.length * 1000 },
    },
    spans: spans.map((span, i) => ({
      id: `span-${i}`,
      name: `span-${i}`,
      kind: 'llm_call' as const,
      startTime: span.startTime ?? i * 1000,
      endTime: span.endTime ?? (i + 1) * 1000,
      status: 'ok',
      events: [
        {
          timestamp: span.endTime ?? (i + 1) * 1000,
          type: 'response' as const,
          name: 'resp',
          attributes: {},
          data: { content: span.content ?? '', toolCalls: span.toolCalls },
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

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `w${i}`).join(' ');
}

describe('SemanticDiffEngine', () => {
  const engine = new SemanticDiffEngine({ textSimilarityThreshold: 0.95 });

  it('should detect no differences for identical traces', () => {
    const trace = createTrace('t1', ['Hello world', 'How are you']);
    const result = engine.compare(trace, trace);

    expect(result.differences).toHaveLength(0);
    expect(result.overallSimilarity).toBe(1);
    expect(result.maxSeverity).toBe('none');
  });

  it('should detect text content differences', () => {
    const baseline = createTrace('base', ['Hello world']);
    const current = createTrace('curr', ['Goodbye world']);
    const result = engine.compare(baseline, current);

    expect(result.differences).toHaveLength(1);
    expect(result.differences[0].type).toBe('text');
    expect(result.differences[0].severity).toBe('high');
    expect(result.maxSeverity).toBe('high');
  });

  it('should detect span count mismatch', () => {
    const baseline = createTrace('base', ['Hello']);
    const current = createTrace('curr', ['Hello', 'World']);
    const result = engine.compare(baseline, current);

    expect(result.differences.some((d) => d.type === 'structure')).toBe(true);
  });

  it('should detect kind mismatch', () => {
    const baseline: Trace = {
      ...createTrace('base', ['Hello']),
      spans: [
        {
          id: 'span-0',
          name: 'span-0',
          kind: 'llm_call',
          startTime: 0,
          endTime: 1000,
          status: 'ok',
          events: [],
          attributes: {},
          links: [],
        },
      ],
    };
    const current: Trace = {
      ...createTrace('curr', ['Hello']),
      spans: [
        {
          id: 'span-0',
          name: 'span-0',
          kind: 'tool_call',
          startTime: 0,
          endTime: 1000,
          status: 'ok',
          events: [
            {
              timestamp: 1000,
              type: 'request' as const,
              name: 'req',
              attributes: {},
              data: { name: 'search' },
            },
          ],
          attributes: {},
          links: [],
        },
      ],
    };

    const result = engine.compare(baseline, current);
    expect(result.differences[0].severity).toBe('critical');
  });

  it('should calculate overall similarity', () => {
    const baseline = createTrace('base', ['Hello world', 'How are you']);
    const current = createTrace('curr', ['Hello world', 'Goodbye']);
    const result = engine.compare(baseline, current);

    expect(result.overallSimilarity).toBeLessThan(1);
    expect(result.overallSimilarity).toBeGreaterThan(0);
  });

  describe('tool call comparison', () => {
    it('should detect tool name change', () => {
      const baseline = createToolTrace('base', [{ name: 'search' }]);
      const current = createToolTrace('curr', [{ name: 'fetch' }]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('tool_call');
      expect(result.differences[0].severity).toBe('high');
      expect(result.differences[0].message).toContain('search');
      expect(result.differences[0].message).toContain('fetch');
    });

    it('should detect tool arguments change', () => {
      const baseline = createToolTrace('base', [{ name: 'search', arguments: { q: 'hello' } }]);
      const current = createToolTrace('curr', [{ name: 'search', arguments: { q: 'world' } }]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('tool_call');
      expect(result.differences[0].severity).toBe('medium');
      expect(result.differences[0].message).toContain('arguments changed');
    });

    it('should detect tool arguments change when baseline lacks arguments', () => {
      const baseline = createToolTrace('base', [{ name: 'search' }]);
      const current = createToolTrace('curr', [{ name: 'search', arguments: { q: 'hello' } }]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('tool_call');
      expect(result.differences[0].severity).toBe('medium');
      expect(result.differences[0].before).toBeNull();
      expect(result.differences[0].after).toEqual({ q: 'hello' });
    });

    it('should detect tool arguments change when current lacks arguments', () => {
      const baseline = createToolTrace('base', [{ name: 'search', arguments: { q: 'hello' } }]);
      const current = createToolTrace('curr', [{ name: 'search' }]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('tool_call');
      expect(result.differences[0].severity).toBe('medium');
      expect(result.differences[0].before).toEqual({ q: 'hello' });
      expect(result.differences[0].after).toBeNull();
    });

    it('should ignore tool call differences when disabled', () => {
      const baseline = createToolTrace('base', [{ name: 'search' }]);
      const current = createToolTrace('curr', [{ name: 'fetch' }]);
      const disabledEngine = new SemanticDiffEngine({ compareToolCalls: false });
      const result = disabledEngine.compare(baseline, current);

      expect(result.differences).toHaveLength(0);
    });

    it('should handle missing request event in tool call', () => {
      const baseline = createToolTrace('base', [null]);
      const current = createToolTrace('curr', [{ name: 'search' }]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('tool_call');
      expect(result.differences[0].severity).toBe('high');
      expect(result.differences[0].before).toBeNull();
      expect(result.differences[0].after).toBe('search');
    });

    it('should report no differences for identical tool calls', () => {
      const baseline = createToolTrace('base', [{ name: 'search', arguments: { q: 'hello' } }]);
      const current = createToolTrace('curr', [{ name: 'search', arguments: { q: 'hello' } }]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(0);
    });

    it('should report no diff when both tool calls lack arguments', () => {
      const baseline = createToolTrace('base', [{ name: 'search' }]);
      const current = createToolTrace('curr', [{ name: 'search' }]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(0);
    });
  });

  describe('routing decision comparison', () => {
    it('should detect routing decision change', () => {
      const baseline = createRoutingTrace('base', [{ target: 'agent-a' }]);
      const current = createRoutingTrace('curr', [{ target: 'agent-b' }]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('routing');
      expect(result.differences[0].severity).toBe('medium');
    });

    it('should ignore routing differences when disabled', () => {
      const baseline = createRoutingTrace('base', [{ target: 'agent-a' }]);
      const current = createRoutingTrace('curr', [{ target: 'agent-b' }]);
      const disabledEngine = new SemanticDiffEngine({ compareRouting: false });
      const result = disabledEngine.compare(baseline, current);

      expect(result.differences).toHaveLength(0);
    });

    it('should handle missing response event in routing decision', () => {
      const baseline = createRoutingTrace('base', [undefined]);
      const current = createRoutingTrace('curr', [{ route: 'home' }]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('routing');
      expect(result.differences[0].severity).toBe('medium');
      expect(result.differences[0].before).toBeNull();
      expect(result.differences[0].after).toEqual({ route: 'home' });
    });

    it('should report no differences when both routing decisions are missing', () => {
      const baseline = createRoutingTrace('base', [undefined]);
      const current = createRoutingTrace('curr', [undefined]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(0);
    });
  });

  describe('timing comparison', () => {
    const baseline: Trace = {
      version: '1.0.0',
      metadata: {
        id: 'base',
        name: 'base',
        createdAt: Date.now(),
        agentVersion: '1.0.0',
        environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
        tags: [],
        summary: { id: 'test', name: 'test', spanCount: 1, duration: 1000 },
      },
      spans: [
        {
          id: 'span-0',
          name: 'span-0',
          kind: 'llm_call',
          startTime: 0,
          endTime: 1000,
          status: 'ok',
          events: [],
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

    it('should detect significant timing change (>50%) as medium', () => {
      const current: Trace = JSON.parse(JSON.stringify(baseline)) as Trace;
      current.spans[0].endTime = 2500;
      const timingEngine = new SemanticDiffEngine({ compareTiming: true });
      const result = timingEngine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('timing');
      expect(result.differences[0].severity).toBe('medium');
      expect(result.differences[0].similarity).toBeCloseTo(-0.5);
    });

    it('should detect moderate timing change (20-50%) as low', () => {
      const current: Trace = JSON.parse(JSON.stringify(baseline)) as Trace;
      current.spans[0].endTime = 1400;
      const timingEngine = new SemanticDiffEngine({ compareTiming: true });
      const result = timingEngine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('timing');
      expect(result.differences[0].severity).toBe('low');
      expect(result.differences[0].similarity).toBeCloseTo(0.6);
    });

    it('should detect timing change when replayed is faster', () => {
      const current: Trace = JSON.parse(JSON.stringify(baseline)) as Trace;
      current.spans[0].endTime = 600;
      const timingEngine = new SemanticDiffEngine({ compareTiming: true });
      const result = timingEngine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('timing');
      expect(result.differences[0].severity).toBe('low');
    });

    it('should ignore timing change below 20%', () => {
      const current: Trace = JSON.parse(JSON.stringify(baseline)) as Trace;
      current.spans[0].endTime = 1100;
      const timingEngine = new SemanticDiffEngine({ compareTiming: true });
      const result = timingEngine.compare(baseline, current);

      expect(result.differences).toHaveLength(0);
    });

    it('should ignore timing when recorded duration is zero', () => {
      const noEndBaseline: Trace = JSON.parse(JSON.stringify(baseline)) as Trace;
      noEndBaseline.spans[0].endTime = undefined;
      const current: Trace = JSON.parse(JSON.stringify(baseline)) as Trace;
      current.spans[0].endTime = 5000;
      const timingEngine = new SemanticDiffEngine({ compareTiming: true });
      const result = timingEngine.compare(noEndBaseline, current);

      expect(result.differences).toHaveLength(0);
    });

    it('should handle missing endTime on replayed side', () => {
      const current: Trace = JSON.parse(JSON.stringify(baseline)) as Trace;
      current.spans[0].endTime = undefined;
      const timingEngine = new SemanticDiffEngine({ compareTiming: true });
      const result = timingEngine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('timing');
      expect(result.differences[0].severity).toBe('medium');
      expect(result.differences[0].before).toBe(1000);
      expect(result.differences[0].after).toBe(0);
    });

    it('should not compare timing when disabled', () => {
      const current: Trace = JSON.parse(JSON.stringify(baseline)) as Trace;
      current.spans[0].endTime = 3000;
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(0);
    });
  });

  describe('text similarity threshold edge cases', () => {
    const defaultEngine = new SemanticDiffEngine(); // threshold = 0.95

    it('should not report diff when similarity is exactly at threshold', () => {
      const baseline = createTrace('base', [words(19)]);
      const current = createTrace('curr', [`${words(19)} extra`]);
      const result = defaultEngine.compare(baseline, current);

      expect(result.differences.filter((d) => d.type === 'text')).toHaveLength(0);
    });

    it('should not report diff when similarity is barely above threshold', () => {
      const baseline = createTrace('base', [words(20)]);
      const current = createTrace('curr', [`${words(20)} extra`]);
      const result = defaultEngine.compare(baseline, current);

      expect(result.differences.filter((d) => d.type === 'text')).toHaveLength(0);
    });

    it('should report medium diff when similarity is barely below threshold', () => {
      const baseline = createTrace('base', [words(18)]);
      const current = createTrace('curr', [`${words(18)} extra`]);
      const result = defaultEngine.compare(baseline, current);

      const textDiffs = result.differences.filter((d) => d.type === 'text');
      expect(textDiffs).toHaveLength(1);
      expect(textDiffs[0].severity).toBe('medium');
    });

    it('should report medium diff when similarity is exactly 0.8', () => {
      const baseline = createTrace('base', [words(4)]);
      const current = createTrace('curr', [`${words(4)} extra`]);
      const result = defaultEngine.compare(baseline, current);

      const textDiffs = result.differences.filter((d) => d.type === 'text');
      expect(textDiffs).toHaveLength(1);
      expect(textDiffs[0].severity).toBe('medium');
    });

    it('should report high diff when similarity is below 0.8', () => {
      const baseline = createTrace('base', [words(3)]);
      const current = createTrace('curr', [`${words(3)} extra`]);
      const result = defaultEngine.compare(baseline, current);

      const textDiffs = result.differences.filter((d) => d.type === 'text');
      expect(textDiffs).toHaveLength(1);
      expect(textDiffs[0].severity).toBe('high');
    });
  });

  describe('empty and missing events', () => {
    it('should handle missing response event in llm_call', () => {
      const baseline = createTrace('base', ['']);
      const current = createTrace('curr', ['hello']);
      const result = engine.compare(baseline, current);

      const textDiffs = result.differences.filter((d) => d.type === 'text');
      expect(textDiffs).toHaveLength(1);
      expect(textDiffs[0].severity).toBe('high');
      expect(textDiffs[0].similarity).toBe(0);
      expect(textDiffs[0].before).toBe('');
    });

    it('should handle missing content field in replayed response', () => {
      const baseline = createTrace('base', ['hello']);
      const current: Trace = JSON.parse(JSON.stringify(baseline)) as Trace;
      current.spans[0].events = [
        { timestamp: 1000, type: 'response', name: 'resp', attributes: {}, data: {} },
      ];
      const result = engine.compare(baseline, current);

      const textDiffs = result.differences.filter((d) => d.type === 'text');
      expect(textDiffs).toHaveLength(1);
      expect(textDiffs[0].severity).toBe('high');
      expect(textDiffs[0].after).toBe('');
    });

    it('should handle both missing response events in llm_call', () => {
      const baseline = createTrace('base', ['']);
      const current = createTrace('curr', ['']);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(0);
    });

    it('should handle missing request event in tool_call', () => {
      const baseline = createToolTrace('base', [null]);
      const current = createToolTrace('curr', [{ name: 'search' }]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('tool_call');
      expect(result.differences[0].severity).toBe('high');
      expect(result.differences[0].before).toBeNull();
      expect(result.differences[0].after).toBe('search');
    });

    it('should handle missing request event in tool_call on current side', () => {
      const baseline = createToolTrace('base', [{ name: 'search' }]);
      const current = createToolTrace('curr', [null]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('tool_call');
      expect(result.differences[0].severity).toBe('high');
      expect(result.differences[0].before).toBe('search');
      expect(result.differences[0].after).toBeNull();
    });

    it('should handle missing response event in routing_decision', () => {
      const baseline = createRoutingTrace('base', [undefined]);
      const current = createRoutingTrace('curr', [{ route: 'home' }]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('routing');
      expect(result.differences[0].severity).toBe('medium');
      expect(result.differences[0].before).toBeNull();
      expect(result.differences[0].after).toEqual({ route: 'home' });
    });

    it('should handle missing response event in routing_decision on current side', () => {
      const baseline = createRoutingTrace('base', [{ route: 'home' }]);
      const current = createRoutingTrace('curr', [undefined]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('routing');
      expect(result.differences[0].severity).toBe('medium');
      expect(result.differences[0].before).toEqual({ route: 'home' });
      expect(result.differences[0].after).toBeNull();
    });

    it('should produce no differences for empty traces', () => {
      const baseline = createTrace('base', []);
      const current = createTrace('curr', []);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(0);
      expect(result.overallSimilarity).toBe(1);
      expect(result.maxSeverity).toBe('none');
    });

    it('should handle span count mismatch when baseline is empty', () => {
      const baseline = createTrace('base', []);
      const current = createTrace('curr', ['hello']);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('structure');
      expect(result.differences[0].severity).toBe('high');
      expect(result.overallSimilarity).toBe(0);
    });
  });

  describe('multiple differences in a single span', () => {
    it('should report text, tool_call, and timing diffs together', () => {
      const baseline = createLLMTraceWithToolCalls('base', [
        {
          content: 'hello world',
          toolCalls: [{ id: '1', name: 'search', arguments: {} }],
          startTime: 0,
          endTime: 1000,
        },
      ]);
      const current = createLLMTraceWithToolCalls('curr', [
        {
          content: 'goodbye world',
          toolCalls: [{ id: '2', name: 'search', arguments: { q: 'x' } }],
          startTime: 0,
          endTime: 3000,
        },
      ]);
      const timingEngine = new SemanticDiffEngine({ compareTiming: true });
      const result = timingEngine.compare(baseline, current);

      expect(result.differences).toHaveLength(3);
      const types = result.differences.map((d) => d.type);
      expect(types).toEqual(expect.arrayContaining(['text', 'tool_call', 'timing']));
      const timingDiff = result.differences.find((d) => d.type === 'timing');
      expect(timingDiff?.severity).toBe('medium');
    });

    it('should average similarities for a step with multiple diffs', () => {
      const baseline = createLLMTraceWithToolCalls('base', [
        { content: 'a b c d e', toolCalls: [{ id: '1', name: 'search' }] },
      ]);
      const current = createLLMTraceWithToolCalls('curr', [
        { content: 'a b c d x', toolCalls: [{ id: '2', name: 'fetch' }] },
      ]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(2);
      // text similarity = 4/6 ≈ 0.6667, tool_call similarity = 0 => average ≈ 0.3333
      expect(result.overallSimilarity).toBeCloseTo(1 / 3, 2);
    });

    it('should report only text diff when tool calls in response are identical', () => {
      const toolCalls = [{ id: '1', name: 'search' }];
      const baseline = createLLMTraceWithToolCalls('base', [{ content: 'hello world', toolCalls }]);
      const current = createLLMTraceWithToolCalls('curr', [
        { content: 'goodbye world', toolCalls },
      ]);
      const result = engine.compare(baseline, current);

      expect(result.differences).toHaveLength(1);
      expect(result.differences[0].type).toBe('text');
    });
  });
});

describe('formatSemanticDiff', () => {
  it('should format a diff report', () => {
    const result = {
      differences: [
        {
          step: 0,
          spanId: 's1',
          type: 'text' as const,
          severity: 'high' as const,
          message: 'Text changed',
          before: 'hello',
          after: 'world',
          similarity: 0.5,
        },
      ],
      overallSimilarity: 0.5,
      maxSeverity: 'high' as const,
    };

    const formatted = formatSemanticDiff(result);
    expect(formatted).toContain('Semantic Diff Report');
    expect(formatted).toContain('Text changed');
    expect(formatted).toContain('50.0%');
  });

  it('should format a report with no differences', () => {
    const result = {
      differences: [],
      overallSimilarity: 1,
      maxSeverity: 'none' as const,
    };

    const formatted = formatSemanticDiff(result);
    expect(formatted).toContain('Semantic Diff Report');
    expect(formatted).toContain('100.0%');
    expect(formatted).toContain('none');
    expect(formatted).toContain('Differences: 0');
  });
});
