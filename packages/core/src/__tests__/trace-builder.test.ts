import type { RecordingConfig } from '@reaatech/agent-replay-shared';
import { describe, expect, it } from 'vitest';

import { TraceBuilder } from '../trace-builder.js';

function createConfig(): RecordingConfig {
  return {
    name: 'test-trace',
    outputPath: '/tmp/test.artrace.json',
  };
}

describe('TraceBuilder', () => {
  const builder = new TraceBuilder();

  it('should create a trace with metadata', () => {
    const config = createConfig();
    const trace = builder.create(config);

    expect(trace.version).toBe('1.0.0');
    expect(trace.metadata.name).toBe('test-trace');
    expect(trace.spans).toHaveLength(0);
    expect(trace.checkpoints).toHaveLength(0);
    expect(trace.indexes.byKind.llm_call).toHaveLength(0);
  });

  it('should start and end spans', () => {
    const config = createConfig();
    const trace = builder.create(config);

    const span = builder.startSpan(trace, 'test-span', 'llm_call');
    expect(span.id).toBe('span-0');
    expect(span.name).toBe('test-span');
    expect(span.kind).toBe('llm_call');
    expect(span.status).toBe('in_progress');
    expect(trace.spans).toHaveLength(1);

    builder.endSpan(trace, span.id, 'ok');
    expect(trace.spans[0].status).toBe('ok');
    expect(trace.spans[0].endTime).toBeDefined();
  });

  it('should add events to in-progress spans', () => {
    const config = createConfig();
    const trace = builder.create(config);

    builder.startSpan(trace, 'span', 'llm_call');
    builder.addEvent(trace, {
      timestamp: Date.now(),
      type: 'response',
      name: 'resp',
      attributes: {},
      data: { content: 'hello' },
    });

    expect(trace.spans[0].events).toHaveLength(1);
    expect(trace.spans[0].events[0].type).toBe('response');
  });

  it('should ignore events when no in-progress span exists', () => {
    const config = createConfig();
    const trace = builder.create(config);

    builder.addEvent(trace, {
      timestamp: Date.now(),
      type: 'response',
      name: 'resp',
      attributes: {},
    });

    expect(trace.spans).toHaveLength(0);
  });

  it('should add checkpoints', () => {
    const config = createConfig();
    const trace = builder.create(config);

    builder.startSpan(trace, 'span', 'llm_call');
    builder.addCheckpoint(trace, { foo: 'bar' });

    expect(trace.checkpoints).toHaveLength(1);
    expect(trace.checkpoints[0].spanId).toBe('span-0');
  });

  it('should finalize a trace', () => {
    const config = createConfig();
    const trace = builder.create(config);

    builder.startSpan(trace, 's1', 'llm_call');
    builder.endSpan(trace, 'span-0', 'ok');
    builder.startSpan(trace, 's2', 'tool_call');
    builder.endSpan(trace, 'span-1', 'ok');

    const finalized = builder.finalize(trace);
    expect(finalized.metadata.summary.spanCount).toBe(2);
    expect(finalized.indexes.byId['span-0']).toBe(0);
    expect(finalized.indexes.byId['span-1']).toBe(1);
    expect(finalized.indexes.byKind.llm_call).toContain(0);
    expect(finalized.indexes.byKind.tool_call).toContain(1);
  });

  it('should add event to a specific span', () => {
    const config = createConfig();
    const trace = builder.create(config);

    builder.startSpan(trace, 'span1', 'llm_call');
    builder.startSpan(trace, 'span2', 'tool_call');
    builder.addEventToSpan(trace, 'span-0', {
      timestamp: Date.now(),
      type: 'response',
      name: 'resp',
      attributes: {},
      data: { content: 'hello' },
    });

    expect(trace.spans[0].events).toHaveLength(1);
    expect(trace.spans[1].events).toHaveLength(0);
  });

  it('should gracefully handle addEventToSpan with missing span', () => {
    const config = createConfig();
    const trace = builder.create(config);

    builder.addEventToSpan(trace, 'nonexistent', {
      timestamp: Date.now(),
      type: 'response',
      name: 'resp',
      attributes: {},
      data: {},
    });

    expect(trace.spans).toHaveLength(0);
  });

  it('should serialize primitive state', () => {
    const config = createConfig();
    const trace = builder.create(config);

    builder.startSpan(trace, 'span', 'llm_call');
    builder.addCheckpoint(trace, 'just a string');

    expect(trace.checkpoints[0].state.variables).toEqual({});
  });

  it('should serialize state that fails structuredClone', () => {
    const config = createConfig();
    const trace = builder.create(config);

    builder.startSpan(trace, 'span', 'llm_call');
    builder.addCheckpoint(trace, { fn: () => {} });

    expect(trace.checkpoints[0].state.variables).toBeDefined();
  });
});
