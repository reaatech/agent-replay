import { unlink } from 'node:fs/promises';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  RecordingEngine,
  ReplayEngine,
  PartialReplayOrchestrator,
  SemanticDiffEngine,
  DivergenceDetector,
  LocalFileStorage,
  TraceSerializer,
} from '@reaatech/core';
import type { Trace, Span, LLMResponse, ReplayConfig } from '@reaatech/shared';

const TEST_TRACE_PATH = '/tmp/e2e-test.artrace.json';

/**
 * Mock LLM that returns predictable responses.
 */
class MockLLM {
  private responses: string[];
  private index = 0;

  constructor(responses: string[]) {
    this.responses = responses;
  }

  complete(_prompt: string): LLMResponse {
    const text = this.responses[this.index++] ?? 'default response';
    return {
      id: `resp-${this.index}`,
      model: 'mock-llm',
      content: text,
      finishReason: 'stop',
      raw: { text },
    };
  }
}

/**
 * Build a realistic-looking trace for E2E testing.
 */
function buildMockTrace(): Trace {
  const engine = new RecordingEngine();
  const session = engine.startRecording({
    name: 'e2e-test',
    outputPath: TEST_TRACE_PATH,
  });

  // Simulate an agent workflow: LLM -> Tool -> LLM
  const span0 = engine.startSpan('greeting', 'llm_call');
  engine.captureEvent(
    {
      timestamp: 1000,
      type: 'response' as const,
      name: 'llm_response',
      attributes: { model: 'gpt-4' },
      data: { content: 'Hello! How can I help?' },
    },
    { spanId: span0 }
  );
  engine.endSpan(span0, 'ok');

  const span1 = engine.startSpan('search', 'tool_call');
  engine.captureEvent(
    {
      timestamp: 2000,
      type: 'request' as const,
      name: 'tool_request',
      attributes: { tool: 'search' },
      data: { query: 'best practices' },
    },
    { spanId: span1 }
  );
  engine.captureEvent(
    {
      timestamp: 2500,
      type: 'response' as const,
      name: 'tool_response',
      attributes: { tool: 'search' },
      data: { results: ['Result 1', 'Result 2'] },
    },
    { spanId: span1 }
  );
  engine.endSpan(span1, 'ok');

  const span2 = engine.startSpan('followup', 'llm_call');
  engine.captureEvent(
    {
      timestamp: 3000,
      type: 'response' as const,
      name: 'llm_response',
      attributes: { model: 'gpt-4' },
      data: { content: 'Here are the best practices...' },
    },
    { spanId: span2 }
  );
  engine.endSpan(span2, 'ok');

  engine.createCheckpoint(session, { step: 2, results: ['Result 1', 'Result 2'] });

  return engine.stopRecording(session);
}

describe('E2E Full Workflow', () => {
  let trace: Trace;

  beforeAll(() => {
    trace = buildMockTrace();
  });

  afterAll(async () => {
    try {
      await unlink(TEST_TRACE_PATH);
    } catch {
      // ignore
    }
  });

  it('should record a complete agent trace', () => {
    expect(trace.spans).toHaveLength(3);
    expect(trace.spans[0].kind).toBe('llm_call');
    expect(trace.spans[1].kind).toBe('tool_call');
    expect(trace.spans[2].kind).toBe('llm_call');
    expect(trace.checkpoints).toHaveLength(1);
    expect(trace.metadata.summary.spanCount).toBe(3);
  });

  it('should serialize and deserialize a trace', async () => {
    const serializer = new TraceSerializer();
    await serializer.serialize(trace, TEST_TRACE_PATH);

    const loaded = await serializer.deserialize(TEST_TRACE_PATH);
    expect(loaded.metadata.id).toBe(trace.metadata.id);
    expect(loaded.spans).toHaveLength(trace.spans.length);
    expect(loaded.checkpoints).toHaveLength(trace.checkpoints.length);
  });

  it('should replay a trace in stubbed mode', () => {
    const replayEngine = new ReplayEngine();
    const result = replayEngine.replay(trace, {
      mode: 'stubbed',
      llmProvider: 'mock',
    } as ReplayConfig);

    expect(result.trace).toBeDefined();
    expect(result.outputs.length).toBeGreaterThan(0);
  });

  it('should perform partial replay to checkpoint', async () => {
    const orchestrator = new PartialReplayOrchestrator();
    const checkpointId = trace.checkpoints[0].id;

    const result = await orchestrator.partialReplay(
      trace,
      checkpointId,
      { mode: 'stubbed' },
      (spans: Span[]) => {
        // Live executor mock
        const mockLLM = new MockLLM(['Live response after checkpoint']);
        return Promise.resolve({
          trace,
          outputs: spans.map(() => ({ content: mockLLM.complete('prompt').content })),
          duration: 100,
        });
      }
    );

    expect(result.outputs.length).toBeGreaterThan(0);
    orchestrator.cleanup();
  });

  it('should detect no divergence for identical replay', () => {
    const detector = new DivergenceDetector();
    const liveResult = {
      trace,
      outputs: [],
      duration: 1000,
    };

    const divergence = detector.detect(trace, liveResult);
    // The detector compares span-by-span; with identical traces it may still
    // report minor differences depending on event data. We just verify it runs.
    expect(divergence === null || divergence.spanDivergences.length === 0).toBe(true);
  });

  it('should compute semantic diff between identical traces', () => {
    const diffEngine = new SemanticDiffEngine();
    const result = diffEngine.compare(trace, trace);

    expect(result.differences).toHaveLength(0);
    expect(result.overallSimilarity).toBe(1);
    expect(result.maxSeverity).toBe('none');
  });

  it('should store and load traces via LocalFileStorage', async () => {
    const storage = new LocalFileStorage('/tmp/e2e-storage');

    await storage.save(trace);
    const loaded = await storage.load(trace.metadata.id);

    expect(loaded.metadata.id).toBe(trace.metadata.id);
    expect(loaded.spans.length).toBe(trace.spans.length);

    await storage.delete(trace.metadata.id);
  });

  it('should stream deserialize a trace', async () => {
    const serializer = new TraceSerializer();
    const filePath = `/tmp/e2e-stream-${Date.now()}.artrace.json`;
    await serializer.serialize(trace, filePath);

    const items: Array<{ kind: string }> = [];
    for await (const item of serializer.streamDeserialize(filePath)) {
      items.push(item as { kind: string });
    }

    // Should yield spans and checkpoints
    expect(items.length).toBeGreaterThan(0);

    await unlink(filePath);
  });
});
