import { describe, it, expect } from 'vitest';
import type { Trace } from '@reaatech/shared';

import { TraceSummarizer, formatSummary } from '../trace-summarizer.js';

function createTrace(
  spans: Array<{
    name: string;
    kind: string;
    status?: string;
    events?: Array<{ type: string; data?: unknown }>;
  }>
): Trace {
  let time = 0;
  return {
    version: '1.0.0',
    metadata: {
      id: 'test',
      name: 'Test Trace',
      createdAt: Date.now(),
      agentVersion: '1.0.0',
      environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
      tags: [],
      summary: { id: 'test', name: 'test', spanCount: spans.length, duration: spans.length * 1000 },
    },
    spans: spans.map((s, i) => ({
      id: `span-${i}`,
      name: s.name,
      kind: s.kind as 'llm_call' | 'tool_call' | 'error',
      startTime: time,
      endTime: (time += 1000),
      status: (s.status as 'ok' | 'error') ?? 'ok',
      events: (s.events ?? []).map((e, j) => ({
        timestamp: time + j,
        type: e.type as 'response' | 'request' | 'error',
        name: 'evt',
        attributes: {},
        data: e.data,
      })),
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

describe('TraceSummarizer', () => {
  const summarizer = new TraceSummarizer();

  it('should summarize a basic trace', () => {
    const trace = createTrace([
      {
        name: 'greet',
        kind: 'llm_call',
        events: [{ type: 'response' as const, data: { content: 'Hello!', usage: { total: 10 } } }],
      },
      {
        name: 'search',
        kind: 'tool_call',
        events: [{ type: 'request' as const, data: { name: 'search' } }],
      },
    ]);

    const summary = summarizer.summarize(trace);
    expect(summary.stats.spanCount).toBe(2);
    expect(summary.stats.llmCallCount).toBe(1);
    expect(summary.stats.toolCallCount).toBe(1);
    expect(summary.stats.errorCount).toBe(0);
    expect(summary.stats.totalTokens).toBe(10);
    expect(summary.description).toContain('Test Trace');
  });

  it('should detect errors', () => {
    const trace = createTrace([
      {
        name: 'fail',
        kind: 'error',
        status: 'error',
        events: [{ type: 'error' as const, data: 'Something broke' }],
      },
    ]);

    const summary = summarizer.summarize(trace);
    expect(summary.stats.errorCount).toBe(1);
    expect(summary.concerns.length).toBeGreaterThan(0);
    expect(summary.highlights.some(h => h.importance === 'high')).toBe(true);
  });

  it('should highlight tool calls', () => {
    const trace = createTrace([
      {
        name: 'search',
        kind: 'tool_call',
        events: [{ type: 'request' as const, data: { name: 'web_search' } }],
      },
    ]);

    const summary = summarizer.summarize(trace);
    expect(summary.highlights.some(h => h.description.includes('Tool execution'))).toBe(true);
  });

  it('should highlight LLM tool call requests', () => {
    const trace = createTrace([
      {
        name: 'plan',
        kind: 'llm_call',
        events: [
          {
            type: 'response' as const,
            data: { content: 'OK', usage: { total: 5 }, toolCalls: [{ id: '1', name: 'search' }] },
          },
        ],
      },
    ]);

    const summary = summarizer.summarize(trace);
    expect(summary.highlights.some(h => h.description.includes('tool call'))).toBe(true);
  });

  it('should flag high LLM call count', () => {
    const spans = Array.from({ length: 15 }, (_, i) => ({
      name: `llm-${i}`,
      kind: 'llm_call' as const,
      events: [{ type: 'response' as const, data: { content: 'x' } }],
    }));
    const trace = createTrace(spans);

    const summary = summarizer.summarize(trace);
    expect(summary.concerns.some(c => c.includes('High number of LLM calls'))).toBe(true);
  });

  it('should flag slow spans', () => {
    const trace = createTrace([
      {
        name: 'slow',
        kind: 'llm_call',
        events: [{ type: 'response' as const, data: { content: 'x' } }],
      },
    ]);
    // Override endTime to make it slow
    trace.spans[0].endTime = trace.spans[0].startTime + 6000;

    const summary = summarizer.summarize(trace);
    expect(summary.concerns.some(c => c.includes('longer than 5 seconds'))).toBe(true);
  });

  it('should format summary', () => {
    const trace = createTrace([
      {
        name: 'greet',
        kind: 'llm_call',
        events: [{ type: 'response' as const, data: { content: 'Hello!' } }],
      },
    ]);

    const summary = summarizer.summarize(trace);
    const formatted = formatSummary(summary);
    expect(formatted).toContain('Trace Summary');
    expect(formatted).toContain('Avg response length');
  });

  it('should handle zero average response length', () => {
    const trace = createTrace([
      { name: 'no-response', kind: 'llm_call', events: [{ type: 'response' as const, data: {} }] },
    ]);

    const summary = summarizer.summarize(trace);
    expect(summary.stats.averageResponseLength).toBe(0);
  });

  it('should produce no concerns for healthy trace', () => {
    const trace = createTrace([
      {
        name: 'greet',
        kind: 'llm_call',
        events: [{ type: 'response' as const, data: { content: 'Hi' } }],
      },
    ]);

    const summary = summarizer.summarize(trace);
    expect(summary.concerns).toHaveLength(0);
  });

  it('should handle error event data that is not an object', () => {
    const trace = createTrace([
      {
        name: 'fail',
        kind: 'error',
        status: 'error',
        events: [{ type: 'error' as const, data: 'plain string error' }],
      },
    ]);

    const summary = summarizer.summarize(trace);
    expect(summary.stats.errorCount).toBe(1);
    expect(summary.highlights[0].description).toContain('plain string error');
  });

  it('should handle tool request data that is not an object', () => {
    const trace = createTrace([
      {
        name: 'search',
        kind: 'tool_call',
        events: [{ type: 'request' as const, data: 'not an object' }],
      },
    ]);

    const summary = summarizer.summarize(trace);
    expect(summary.highlights[0].description).toContain('Tool execution');
  });

  it('should handle spans without endTime', () => {
    const trace = createTrace([
      {
        name: 'no-end',
        kind: 'llm_call',
        events: [{ type: 'response' as const, data: { content: 'x' } }],
      },
    ]);
    trace.spans[0].endTime = undefined;

    const summary = summarizer.summarize(trace);
    expect(summary.stats.spanCount).toBe(1);
  });

  it('should format summary with no highlights or concerns', () => {
    const trace = createTrace([
      {
        name: 'greet',
        kind: 'llm_call',
        events: [{ type: 'response' as const, data: { content: 'Hi' } }],
      },
    ]);

    const summary = summarizer.summarize(trace);
    const formatted = formatSummary(summary);
    expect(formatted).toContain('Trace Summary');
    expect(formatted).not.toContain('Highlights');
    expect(formatted).not.toContain('Concerns');
  });

  it('should format summary with highlights and concerns', () => {
    const trace = createTrace([
      {
        name: 'plan',
        kind: 'llm_call',
        events: [
          {
            type: 'response' as const,
            data: { content: 'OK', usage: { total: 5 }, toolCalls: [{ id: '1', name: 'search' }] },
          },
        ],
      },
      {
        name: 'fail',
        kind: 'error',
        status: 'error',
        events: [{ type: 'error' as const, data: 'Broke' }],
      },
    ]);

    const summary = summarizer.summarize(trace);
    const formatted = formatSummary(summary);
    expect(formatted).toContain('Trace Summary');
    expect(formatted).toContain('Highlights');
    expect(formatted).toContain('Concerns');
    expect(formatted).toContain('Total tokens');
  });
});
