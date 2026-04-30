import type { RecordingEngine } from '@reaatech/agent-replay-core';
import {
  type CaptureContext,
  InterceptorError,
  type RecordedStream,
  type StreamChunk,
} from '@reaatech/agent-replay-shared';

import {
  AnthropicAdapter,
  type AnthropicMessage,
  type AnthropicMessageCreateParams,
  type AnthropicMessageStreamEvent,
} from './anthropic-adapter.js';
import { BaseInterceptor, type InstallationResult } from './interceptor.js';

// Minimal Anthropic client interface for typing
interface AnthropicClientLike {
  messages: {
    create: (...args: unknown[]) => unknown;
  };
}

/**
 * Monkey-patch interceptor for the Anthropic SDK.
 *
 * Installation strategy: patches `client.messages.create` at runtime.
 */
export class AnthropicInterceptor extends BaseInterceptor {
  private originalCreate: ((...args: unknown[]) => unknown) | null = null;
  private client: AnthropicClientLike | null = null;

  constructor(recorder: RecordingEngine) {
    super(new AnthropicAdapter(), recorder);
  }

  async install(target: unknown): Promise<InstallationResult> {
    const client = target as AnthropicClientLike;

    if (!client.messages?.create) {
      throw new InterceptorError(
        'anthropic',
        new Error('Target does not look like an Anthropic client'),
      );
    }

    this.client = client;
    this.originalCreate = client.messages.create;

    client.messages.create = async (...args: unknown[]) => {
      const [request] = args as [AnthropicMessageCreateParams];

      const normalizedRequest = this.adapter.normalizeRequest(request);
      const redactedRequest = this.redactSensitiveFields(normalizedRequest.raw);

      let spanId: string | undefined;
      if (this.recorder.isRecording) {
        spanId = this.recorder.startSpan('anthropic-message', 'llm_call');
        this.recorder.captureEvent(
          {
            timestamp: Date.now(),
            type: 'request',
            name: 'anthropic-request',
            attributes: { provider: 'anthropic', model: normalizedRequest.model },
            data: redactedRequest,
          },
          { spanId } as CaptureContext,
        );
      }

      const rawResponse = await this.originalCreate?.call(client.messages, ...args);

      if (request.stream) {
        return this.handleStreamingResponse(
          rawResponse as AsyncIterable<AnthropicMessageStreamEvent>,
          spanId,
        );
      }

      if (spanId) {
        const normalizedResponse = this.adapter.normalizeResponse(rawResponse as AnthropicMessage);
        this.recorder.captureEvent(
          {
            timestamp: Date.now(),
            type: 'response',
            name: 'anthropic-response',
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
      interceptedMethods: ['messages.create'],
    });
  }

  async uninstall(): Promise<void> {
    if (this.client && this.originalCreate) {
      this.client.messages.create = this.originalCreate;
      this.client = null;
      this.originalCreate = null;
    }
    return Promise.resolve();
  }

  private async *handleStreamingResponse(
    source: AsyncIterable<AnthropicMessageStreamEvent>,
    spanId?: string,
  ): AsyncGenerator<AnthropicMessageStreamEvent> {
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
          name: 'anthropic-stream-response',
          attributes: {},
          data: recordedStream,
        },
        { spanId } as CaptureContext,
      );
      this.recorder.endSpan(spanId);
    }
  }
}
