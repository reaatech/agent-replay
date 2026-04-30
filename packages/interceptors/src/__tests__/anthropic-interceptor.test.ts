import { RecordingEngine } from '@reaatech/agent-replay-core';
import { InterceptorError } from '@reaatech/agent-replay-shared';
import { describe, expect, it, vi } from 'vitest';

import type {
  AnthropicMessage,
  AnthropicMessageCreateParams,
  AnthropicMessageStreamEvent,
} from '../anthropic-adapter.js';
import { AnthropicInterceptor } from '../anthropic-interceptor.js';

function createMockClient() {
  return {
    messages: {
      create: vi.fn(),
    },
  };
}

describe('AnthropicInterceptor', () => {
  it('should construct with a RecordingEngine', () => {
    const recorder = new RecordingEngine();
    const interceptor = new AnthropicInterceptor(recorder);
    expect(interceptor).toBeInstanceOf(AnthropicInterceptor);
  });

  describe('install', () => {
    it('should throw when target does not look like an Anthropic client', async () => {
      const interceptor = new AnthropicInterceptor(new RecordingEngine());
      await expect(interceptor.install({})).rejects.toThrow(InterceptorError);
      await expect(interceptor.install({ messages: {} })).rejects.toThrow(InterceptorError);
    });

    it('should patch messages.create and return installation result', async () => {
      const interceptor = new AnthropicInterceptor(new RecordingEngine());
      const client = createMockClient();
      const originalCreate = client.messages.create;

      const result = await interceptor.install(client);

      expect(result.success).toBe(true);
      expect(result.pattern).toBe('monkey-patch');
      expect(result.interceptedMethods).toEqual(['messages.create']);
      expect(client.messages.create).not.toBe(originalCreate);
    });

    it('should call original create for non-streaming requests', async () => {
      const interceptor = new AnthropicInterceptor(new RecordingEngine());
      const client = createMockClient();
      const originalCreate = client.messages.create;

      const response: AnthropicMessage = {
        id: 'msg-123',
        model: 'claude-3',
        content: [{ type: 'text', text: 'Hello!' }],
        stop_reason: 'end_turn',
      };

      originalCreate.mockResolvedValue(response);

      await interceptor.install(client);

      const request: AnthropicMessageCreateParams = {
        model: 'claude-3',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
      };

      const result = (await client.messages.create(request)) as AnthropicMessage;

      expect(originalCreate).toHaveBeenCalledTimes(1);
      expect(result).toBe(response);
    });

    it('should handle streaming responses', async () => {
      const interceptor = new AnthropicInterceptor(new RecordingEngine());
      const client = createMockClient();

      const chunks: AnthropicMessageStreamEvent[] = [
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } },
      ];

      async function* generateChunks() {
        await Promise.resolve();
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      client.messages.create.mockResolvedValue(generateChunks());

      await interceptor.install(client);

      const request: AnthropicMessageCreateParams = {
        model: 'claude-3',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
      };

      const stream = (await client.messages.create(
        request,
      )) as AsyncIterable<AnthropicMessageStreamEvent>;
      const received: AnthropicMessageStreamEvent[] = [];
      for await (const chunk of stream) {
        received.push(chunk);
      }

      expect(received).toHaveLength(2);
    });

    it('should record request and response when a session is active', async () => {
      const recorder = new RecordingEngine();
      const session = recorder.startRecording({ name: 'test', providers: ['anthropic'] });

      const interceptor = new AnthropicInterceptor(recorder);
      const client = createMockClient();

      const response: AnthropicMessage = {
        id: 'msg-123',
        model: 'claude-3',
        content: [{ type: 'text', text: 'Ok' }],
        stop_reason: 'end_turn',
      };

      client.messages.create.mockResolvedValue(response);

      await interceptor.install(client);

      const request: AnthropicMessageCreateParams = {
        model: 'claude-3',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
      };

      await client.messages.create(request);

      expect(session.trace.spans.length).toBeGreaterThan(0);
      expect(session.trace.spans[0].kind).toBe('llm_call');
      expect(session.trace.spans[0].events.length).toBeGreaterThanOrEqual(2);

      recorder.stopRecording(session);
    });

    it('should record streaming response when a session is active', async () => {
      const recorder = new RecordingEngine();
      const session = recorder.startRecording({ name: 'test', providers: ['anthropic'] });

      const interceptor = new AnthropicInterceptor(recorder);
      const client = createMockClient();

      const chunks: AnthropicMessageStreamEvent[] = [
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: ' world' } },
      ];

      async function* generateChunks() {
        await Promise.resolve();
        for (const chunk of chunks) yield chunk;
      }

      client.messages.create.mockResolvedValue(generateChunks());

      await interceptor.install(client);

      const request: AnthropicMessageCreateParams = {
        model: 'claude-3',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
      };

      const stream = (await client.messages.create(
        request,
      )) as AsyncIterable<AnthropicMessageStreamEvent>;
      const received: AnthropicMessageStreamEvent[] = [];
      for await (const chunk of stream) {
        received.push(chunk);
      }

      expect(received).toHaveLength(2);
      expect(session.trace.spans.length).toBeGreaterThan(0);
      expect(
        session.trace.spans[0].events.some((e) => e.name === 'anthropic-stream-response'),
      ).toBe(true);

      recorder.stopRecording(session);
    });
  });

  describe('uninstall', () => {
    it('should restore original create method', async () => {
      const interceptor = new AnthropicInterceptor(new RecordingEngine());
      const client = createMockClient();
      const originalCreate = client.messages.create;

      await interceptor.install(client);
      expect(client.messages.create).not.toBe(originalCreate);

      await interceptor.uninstall();
      expect(client.messages.create).toBe(originalCreate);
    });
  });
});
