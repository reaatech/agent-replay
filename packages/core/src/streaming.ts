import type { LLMResponse, RecordedStream, StreamChunk } from '@reaatech/agent-replay-shared';

export interface StreamingConfig {
  preserveTiming: boolean;
}

/**
 * Records a stream of chunks from an LLM provider while also passing them through
 * to the original consumer. This is a "tee" pattern: the agent receives chunks in
 * real time while we save them for later replay.
 */
export class StreamingRecorder {
  private chunks: StreamChunk[] = [];
  private startTime = 0;

  async *record<T>(
    source: AsyncIterable<T>,
    normalizeChunk: (native: T) => StreamChunk,
  ): AsyncGenerator<T> {
    this.startTime = performance.now();

    for await (const nativeChunk of source) {
      const chunk = normalizeChunk(nativeChunk);
      this.chunks.push(chunk);
      yield nativeChunk;
    }
  }

  finalize(aggregatedResponse: LLMResponse): RecordedStream {
    return {
      chunks: this.chunks,
      aggregatedContent: aggregatedResponse.content,
      aggregatedToolCalls: aggregatedResponse.toolCalls,
      duration: Math.round(performance.now() - this.startTime),
      totalChunks: this.chunks.length,
    };
  }
}

/**
 * Replays a recorded stream by yielding the original chunks.
 * Can optionally preserve original timing delays between chunks.
 */
export class StreamingStubEngine {
  private config: StreamingConfig;
  private responseCounter = 0;

  constructor(config: StreamingConfig = { preserveTiming: false }) {
    this.config = config;
  }

  async *replayStream<T>(
    recorded: RecordedStream,
    denormalizeChunk: (chunk: StreamChunk) => T,
  ): AsyncGenerator<T> {
    for (let i = 0; i < recorded.chunks.length; i++) {
      const chunk = recorded.chunks[i];
      yield denormalizeChunk(chunk);

      if (this.config.preserveTiming && i < recorded.chunks.length - 1) {
        // Simple uniform delay based on total duration
        const delay = Math.round(recorded.duration / recorded.totalChunks);
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  /**
   * Aggregates a recorded stream back into a single response object.
   * This is used for non-streaming consumers during replay.
   */
  toResponse(recorded: RecordedStream): LLMResponse {
    const responseId = `stub-${this.responseCounter++}`;
    return {
      id: responseId,
      model: 'stubbed',
      content: recorded.aggregatedContent,
      toolCalls: recorded.aggregatedToolCalls,
      finishReason: recorded.chunks[recorded.chunks.length - 1]?.finishReason ?? 'stop',
      raw: { recorded: true },
    };
  }
}
