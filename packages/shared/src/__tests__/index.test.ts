import { describe, it, expect } from 'vitest';

import {
  AgentReplayError,
  TraceNotFoundError,
  InvalidTraceError,
  type Trace,
  type Span,
} from '../index.js';

describe('shared types', () => {
  it('should export AgentReplayError base class', () => {
    const err = new TraceNotFoundError('test-id');
    expect(err).toBeInstanceOf(AgentReplayError);
    expect(err.code).toBe('TRACE_NOT_FOUND');
    expect(err.message).toBe('Trace not found: test-id');
  });

  it('should export InvalidTraceError with validation errors', () => {
    const err = new InvalidTraceError('bad trace', [{ field: 'metadata.id', message: 'missing' }]);
    expect(err.code).toBe('INVALID_TRACE');
    expect(err.validationErrors).toHaveLength(1);
  });

  it('should allow constructing a valid Trace shape', () => {
    const trace: Trace = {
      version: '1.0.0',
      metadata: {
        id: 'test-trace',
        name: 'Test',
        createdAt: Date.now(),
        agentVersion: '1.0.0',
        environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
        tags: ['test'],
        summary: { id: 'test-trace-summary', name: 'Test Summary', spanCount: 0, duration: 0 },
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

    expect(trace.metadata.id).toBe('test-trace');
    expect(trace.spans).toHaveLength(0);
  });

  it('should allow constructing a valid Span shape', () => {
    const span: Span = {
      id: 'span-1',
      name: 'test-span',
      kind: 'llm_call',
      startTime: Date.now(),
      status: 'ok',
      events: [],
      attributes: {},
      links: [],
    };

    expect(span.kind).toBe('llm_call');
    expect(span.status).toBe('ok');
  });
});
