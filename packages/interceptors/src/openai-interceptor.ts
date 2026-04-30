import type { RecordingEngine } from '@reaatech/agent-replay-core';
import {
  type CaptureContext,
  InterceptorError,
  type RecordedStream,
  type StreamChunk,
} from '@reaatech/agent-replay-shared';

import { BaseInterceptor, type InstallationResult } from './interceptor.js';
import {
  OpenAIAdapter,
  type OpenAIChatCompletion,
  type OpenAIChatCompletionChunk,
  type OpenAIChatCompletionCreateParams,
} from './openai-adapter.js';

// Minimal OpenAI client interface for typing
interface OpenAIClientLike {
  chat: {
    completions: {
      create: (...args: unknown[]) => unknown;
    };
  };
}

/**
 * Monkey-patch interceptor for the OpenAI SDK.
 *
 * Installation strategy: patches `client.chat.completions.create` at runtime.
 * No agent code changes required.
 */
export class OpenAIInterceptor extends BaseInterceptor {
  private originalCreate: ((...args: unknown[]) => unknown) | null = null;
  private client: OpenAIClientLike | null = null;

  constructor(recorder: RecordingEngine) {
    super(new OpenAIAdapter(), recorder);
  }

  async install(target: unknown): Promise<InstallationResult> {
    const client = target as OpenAIClientLike;

    if (!client.chat?.completions?.create) {
      throw new InterceptorError('openai', new Error('Target does not look like an OpenAI client'));
    }

    this.client = client;
    this.originalCreate = client.chat.completions.create;

    client.chat.completions.create = async (...args: unknown[]) => {
      const [request] = args as [OpenAIChatCompletionCreateParams];

      const normalizedRequest = this.adapter.normalizeRequest(request);
      const redactedRequest = this.redactSensitiveFields(normalizedRequest.raw);

      let spanId: string | undefined;
      if (this.recorder.isRecording) {
        spanId = this.recorder.startSpan('openai-chat-completion', 'llm_call');
        this.recorder.captureEvent(
          {
            timestamp: Date.now(),
            type: 'request',
            name: 'openai-request',
            attributes: { provider: 'openai', model: normalizedRequest.model },
            data: redactedRequest,
          },
          { spanId } as CaptureContext,
        );
      }

      const rawResponse = await this.originalCreate?.call(client.chat.completions, ...args);

      if (request.stream) {
        return this.handleStreamingResponse(
          rawResponse as AsyncIterable<OpenAIChatCompletionChunk>,
          spanId,
        );
      }

      if (spanId) {
        const normalizedResponse = this.adapter.normalizeResponse(
          rawResponse as OpenAIChatCompletion,
        );
        this.recorder.captureEvent(
          {
            timestamp: Date.now(),
            type: 'response',
            name: 'openai-response',
            attributes: {},
            data: normalizedResponse,
          },
          { spanId } as CaptureContext,
        );
        this.recorder.endSpan(spanId);
      }

      return rawResponse;
    };

    return Promise.resolve({
      success: true,
      pattern: 'monkey-patch',
      interceptedMethods: ['chat.completions.create'],
    });
  }

  async uninstall(): Promise<void> {
    if (this.client && this.originalCreate) {
      this.client.chat.completions.create = this.originalCreate;
      this.client = null;
      this.originalCreate = null;
    }
    return Promise.resolve();
  }

  private async *handleStreamingResponse(
    source: AsyncIterable<OpenAIChatCompletionChunk>,
    spanId?: string,
  ): AsyncGenerator<OpenAIChatCompletionChunk> {
    const chunks: StreamChunk[] = [];
    let content = '';

    try {
      for await (const nativeChunk of source) {
        const chunk = this.adapter.normalizeChunk(nativeChunk);
        chunks.push(chunk);
        content += chunk.delta;
        yield nativeChunk;
      }
    } catch (error) {
      if (spanId) {
        this.recorder.captureEvent(
          {
            timestamp: Date.now(),
            type: 'error',
            name: 'stream-error',
            attributes: { error: (error as Error).message },
            data: { message: (error as Error).message },
          },
          { spanId } as CaptureContext,
        );
        this.recorder.endSpan(spanId, 'error');
      }
      throw error;
    }

    if (spanId) {
      const recordedStream: RecordedStream = {
        chunks,
        aggregatedContent: content,
        duration: 0,
        totalChunks: chunks.length,
      };

      this.recorder.captureEvent(
        {
          timestamp: Date.now(),
          type: 'response',
          name: 'openai-stream-response',
          attributes: {},
          data: recordedStream,
        },
        { spanId } as CaptureContext,
      );
      this.recorder.endSpan(spanId);
    }
  }
}
