import type { LLMResponse, StreamChunk } from '@reaatech/agent-replay-shared';
import { describe, expect, it } from 'vitest';

import { StreamingRecorder, StreamingStubEngine } from '../streaming.js';

describe('StreamingRecorder', () => {
  it('should record a stream', async () => {
    const recorder = new StreamingRecorder();
    const chunks: StreamChunk[] = [
      { index: 0, delta: 'Hello' },
      { index: 1, delta: ' world' },
      { index: 2, delta: '!', finishReason: 'stop' },
    ];

    async function* source(): AsyncGenerator<StreamChunk> {
      await Promise.resolve();
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    const normalizeChunk = (c: StreamChunk) => c;
    const recorded: StreamChunk[] = [];
    for await (const chunk of recorder.record(source(), normalizeChunk)) {
      recorded.push(chunk);
    }

    expect(recorded).toHaveLength(3);
    expect(recorded[0].delta).toBe('Hello');
  });

  it('should finalize a recorded stream', () => {
    const recorder = new StreamingRecorder();
    const response: LLMResponse = {
      id: 'resp-1',
      model: 'gpt-4',
      content: 'Hello world!',
      finishReason: 'stop',
      raw: {},
    };

    const recorded = recorder.finalize(response);
    expect(recorded.aggregatedContent).toBe('Hello world!');
    expect(recorded.totalChunks).toBe(0);
    expect(recorded.duration).toBeGreaterThanOrEqual(0);
  });

  it('should preserve chunk content through recording', async () => {
    const recorder = new StreamingRecorder();
    const chunks: StreamChunk[] = [
      { index: 0, delta: 'A' },
      { index: 1, delta: 'B' },
    ];

    async function* source(): AsyncGenerator<StreamChunk> {
      await Promise.resolve();
      for (const chunk of chunks) yield chunk;
    }

    const normalizeChunk = (c: StreamChunk) => c;
    const output: StreamChunk[] = [];
    for await (const chunk of recorder.record(source(), normalizeChunk)) {
      output.push(chunk);
    }

    expect(output.map((c) => c.delta).join('')).toBe('AB');
  });
});

describe('StreamingStubEngine', () => {
  it('should replay recorded chunks', async () => {
    const engine = new StreamingStubEngine();
    const recorded = {
      chunks: [
        { index: 0, delta: 'Hello' },
        { index: 1, delta: ' world' },
      ],
      aggregatedContent: 'Hello world',
      duration: 100,
      totalChunks: 2,
    };

    const denormalizeChunk = (c: StreamChunk) => c;
    const output: StreamChunk[] = [];
    for await (const chunk of engine.replayStream(recorded, denormalizeChunk)) {
      output.push(chunk);
    }

    expect(output).toHaveLength(2);
    expect(output[0].delta).toBe('Hello');
  });

  it('should convert recorded stream to response', () => {
    const engine = new StreamingStubEngine();
    const recorded = {
      chunks: [{ index: 0, delta: 'Test', finishReason: 'stop' as const }],
      aggregatedContent: 'Test',
      duration: 50,
      totalChunks: 1,
    };

    const response = engine.toResponse(recorded);
    expect(response.content).toBe('Test');
    expect(response.finishReason).toBe('stop');
  });

  it('should replay with timing preservation', async () => {
    const engine = new StreamingStubEngine({ preserveTiming: true });
    const recorded = {
      chunks: [
        { index: 0, delta: 'A' },
        { index: 1, delta: 'B' },
      ],
      aggregatedContent: 'AB',
      duration: 100,
      totalChunks: 2,
    };

    const denormalizeChunk = (c: StreamChunk) => c;
    const start = Date.now();
    const chunks: StreamChunk[] = [];
    for await (const chunk of engine.replayStream(recorded, denormalizeChunk)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0].delta).toBe('A');
    // Should have some delay between chunks
    expect(Date.now() - start).toBeGreaterThanOrEqual(0);
  });

  it('should fallback finishReason when chunks are empty', () => {
    const engine = new StreamingStubEngine();
    const recorded = {
      chunks: [],
      aggregatedContent: '',
      duration: 0,
      totalChunks: 0,
    };

    const response = engine.toResponse(recorded);
    expect(response.finishReason).toBe('stop');
  });
});
