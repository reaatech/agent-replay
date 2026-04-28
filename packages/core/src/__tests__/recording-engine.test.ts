import { describe, it, expect, beforeEach } from 'vitest';
import { RecordingFailedError } from '@reaatech/shared';

import { RecordingEngine } from '../recording-engine.js';

describe('RecordingEngine', () => {
  let engine: RecordingEngine;

  beforeEach(() => {
    engine = new RecordingEngine();
  });

  it('should start and stop recording', () => {
    const session = engine.startRecording({
      name: 'test-session',
      outputPath: '/tmp/test.artrace.json',
    });

    expect(engine.isRecording).toBe(true);
    expect(session.trace.metadata.name).toBe('test-session');

    const trace = engine.stopRecording(session);
    expect(engine.isRecording).toBe(false);
    expect(trace.metadata.summary.spanCount).toBe(0);
  });

  it('should throw when starting while already recording', () => {
    engine.startRecording({
      name: 'first',
      outputPath: '/tmp/first.artrace.json',
    });

    expect(() =>
      engine.startRecording({
        name: 'second',
        outputPath: '/tmp/second.artrace.json',
      })
    ).toThrow(RecordingFailedError);

    engine.stopRecording(engine['activeSession']!);
  });

  it('should throw when stopping invalid session', () => {
    const session1 = engine.startRecording({
      name: 's1',
      outputPath: '/tmp/s1.artrace.json',
    });
    engine.stopRecording(session1);

    const session2 = engine.startRecording({
      name: 's2',
      outputPath: '/tmp/s2.artrace.json',
    });

    expect(() => engine.stopRecording(session1)).toThrow(RecordingFailedError);
    engine.stopRecording(session2);
  });

  it('should capture events during recording', () => {
    const session = engine.startRecording({
      name: 'event-test',
      outputPath: '/tmp/event.artrace.json',
    });

    engine.startSpan('test-span', 'llm_call');
    engine.captureEvent(
      {
        timestamp: Date.now(),
        type: 'response',
        name: 'llm-response',
        attributes: { model: 'gpt-4' },
        data: { content: 'hello' },
      },
      {}
    );

    const trace = engine.stopRecording(session);
    expect(trace.spans[0].events).toHaveLength(1);
    expect(trace.spans[0].events[0].name).toBe('llm-response');
  });

  it('should throw when capturing events without recording', () => {
    expect(() =>
      engine.captureEvent(
        { timestamp: Date.now(), type: 'response', name: 'x', attributes: {} },
        {}
      )
    ).toThrow(RecordingFailedError);
  });

  it('should create checkpoints during recording', () => {
    const session = engine.startRecording({
      name: 'cp-test',
      outputPath: '/tmp/cp.artrace.json',
    });

    engine.startSpan('span', 'llm_call');
    engine.createCheckpoint(session, { count: 42 });

    const trace = engine.stopRecording(session);
    expect(trace.checkpoints).toHaveLength(1);
    expect(trace.checkpoints[0].state.variables.count).toBe(42);
  });

  it('should throw when creating checkpoint without recording', () => {
    expect(() =>
      engine.createCheckpoint(null as unknown as ReturnType<typeof engine.startRecording>, {})
    ).toThrow(RecordingFailedError);
  });

  it('should manage span lifecycle', () => {
    const session = engine.startRecording({
      name: 'span-test',
      outputPath: '/tmp/span.artrace.json',
    });

    const spanId = engine.startSpan('my-span', 'tool_call');
    expect(session.trace.spans).toHaveLength(1);
    expect(session.trace.spans[0].status).toBe('in_progress');

    engine.endSpan(spanId, 'ok');
    expect(session.trace.spans[0].status).toBe('ok');
    expect(session.trace.spans[0].endTime).toBeDefined();

    engine.stopRecording(session);
  });

  it('should throw when starting span without recording', () => {
    expect(() => engine.startSpan('x', 'llm_call')).toThrow(RecordingFailedError);
  });

  it('should throw when ending span without recording', () => {
    expect(() => engine.endSpan('x')).toThrow(RecordingFailedError);
  });

  it('should expose isRecording state', () => {
    expect(engine.isRecording).toBe(false);
    const session = engine.startRecording({ name: 'test' });
    expect(engine.isRecording).toBe(true);
    engine.stopRecording(session);
    expect(engine.isRecording).toBe(false);
  });

  it('should allow session to capture events', () => {
    const session = engine.startRecording({ name: 'test' });
    session.captureEvent(
      { timestamp: Date.now(), type: 'response', name: 'resp', attributes: {}, data: {} },
      { spanId: 's1' }
    );
    expect(session.trace.spans).toHaveLength(0); // no in-progress span, so event is dropped
    engine.stopRecording(session);
  });

  it('should allow session to create checkpoints', () => {
    const session = engine.startRecording({ name: 'test' });
    const spanId = engine.startSpan('test', 'llm_call');
    session.createCheckpoint({ foo: 'bar' });
    expect(session.trace.checkpoints).toHaveLength(1);
    engine.endSpan(spanId);
    engine.stopRecording(session);
  });
});
