import { describe, it, expect, vi } from 'vitest';
import { RecordingEngine } from '@reaatech/core';
import { InterceptorError } from '@reaatech/shared';

import { OpenAIInterceptor } from '../openai-interceptor.js';
import type {
  OpenAIChatCompletion,
  OpenAIChatCompletionChunk,
  OpenAIChatCompletionCreateParams,
} from '../openai-adapter.js';

function createMockClient() {
  return {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  };
}

describe('OpenAIInterceptor', () => {
  it('should construct with a RecordingEngine', () => {
    const recorder = new RecordingEngine();
    const interceptor = new OpenAIInterceptor(recorder);
    expect(interceptor).toBeInstanceOf(OpenAIInterceptor);
  });

  describe('install', () => {
    it('should throw when target does not look like an OpenAI client', async () => {
      const interceptor = new OpenAIInterceptor(new RecordingEngine());
      await expect(interceptor.install({})).rejects.toThrow(InterceptorError);
      await expect(interceptor.install({ chat: {} })).rejects.toThrow(InterceptorError);
      await expect(interceptor.install({ chat: { completions: {} } })).rejects.toThrow(
        InterceptorError
      );
    });

    it('should patch chat.completions.create and return installation result', async () => {
      const interceptor = new OpenAIInterceptor(new RecordingEngine());
      const client = createMockClient();
      const originalCreate = client.chat.completions.create;

      const result = await interceptor.install(client);

      expect(result.success).toBe(true);
      expect(result.pattern).toBe('monkey-patch');
      expect(result.interceptedMethods).toEqual(['chat.completions.create']);
      expect(client.chat.completions.create).not.toBe(originalCreate);
    });

    it('should call original create for non-streaming requests', async () => {
      const interceptor = new OpenAIInterceptor(new RecordingEngine());
      const client = createMockClient();
      const originalCreate = client.chat.completions.create;

      const response: OpenAIChatCompletion = {
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [
          {
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
      };

      originalCreate.mockResolvedValue(response);

      await interceptor.install(client);

      const request: OpenAIChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
      };

      const result = (await client.chat.completions.create(request)) as OpenAIChatCompletion;

      expect(originalCreate).toHaveBeenCalledTimes(1);
      expect(result).toBe(response);
    });

    it('should handle streaming responses', async () => {
      const interceptor = new OpenAIInterceptor(new RecordingEngine());
      const client = createMockClient();

      const chunks: OpenAIChatCompletionChunk[] = [
        {
          id: 'chatcmpl-123',
          choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
        },
        {
          id: 'chatcmpl-123',
          choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
        },
        {
          id: 'chatcmpl-123',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        },
      ];

      async function* generateChunks() {
        await Promise.resolve();
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      client.chat.completions.create.mockResolvedValue(generateChunks());

      await interceptor.install(client);

      const request: OpenAIChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
      };

      const stream = (await client.chat.completions.create(
        request
      )) as AsyncIterable<OpenAIChatCompletionChunk>;
      const received: OpenAIChatCompletionChunk[] = [];
      for await (const chunk of stream) {
        received.push(chunk);
      }

      expect(received).toHaveLength(3);
      expect(received[0].choices[0].delta.content).toBe('Hello');
      expect(received[1].choices[0].delta.content).toBe(' world');
      expect(received[2].choices[0].finish_reason).toBe('stop');
    });

    it('should handle streaming responses with tool call deltas', async () => {
      const interceptor = new OpenAIInterceptor(new RecordingEngine());
      const client = createMockClient();

      const chunks: OpenAIChatCompletionChunk[] = [
        {
          id: 'chatcmpl-123',
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'get_weather', arguments: '' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: 0, function: { arguments: '{"location": "NYC"}' } }],
              },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-123',
          choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
        },
      ];

      async function* generateChunks() {
        await Promise.resolve();
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      client.chat.completions.create.mockResolvedValue(generateChunks());

      await interceptor.install(client);

      const request: OpenAIChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Weather?' }],
        stream: true,
      };

      const stream = (await client.chat.completions.create(
        request
      )) as AsyncIterable<OpenAIChatCompletionChunk>;
      const received: OpenAIChatCompletionChunk[] = [];
      for await (const chunk of stream) {
        received.push(chunk);
      }

      expect(received).toHaveLength(3);
      expect(received[0].choices[0].delta.tool_calls?.[0].function?.name).toBe('get_weather');
    });

    it('should preserve this binding when calling patched method', async () => {
      const interceptor = new OpenAIInterceptor(new RecordingEngine());
      const client = createMockClient();

      const response: OpenAIChatCompletion = {
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [{ message: { role: 'assistant', content: 'Ok' }, finish_reason: 'stop' }],
      };

      client.chat.completions.create.mockResolvedValue(response);

      await interceptor.install(client);

      const request: OpenAIChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
      };

      const result = (await client.chat.completions.create(request)) as OpenAIChatCompletion;
      expect(result).toBe(response);
    });

    it('should record request and response when a session is active', async () => {
      const recorder = new RecordingEngine();
      const session = recorder.startRecording({ name: 'test', providers: ['openai'] });

      const interceptor = new OpenAIInterceptor(recorder);
      const client = createMockClient();

      const response: OpenAIChatCompletion = {
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [{ message: { role: 'assistant', content: 'Ok' }, finish_reason: 'stop' }],
      };

      client.chat.completions.create.mockResolvedValue(response);

      await interceptor.install(client);

      const request: OpenAIChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
      };

      await client.chat.completions.create(request);

      expect(session.trace.spans.length).toBeGreaterThan(0);
      expect(session.trace.spans[0].kind).toBe('llm_call');
      expect(session.trace.spans[0].events.length).toBeGreaterThanOrEqual(2);

      recorder.stopRecording(session);
    });

    it('should record streaming response when a session is active', async () => {
      const recorder = new RecordingEngine();
      const session = recorder.startRecording({ name: 'test', providers: ['openai'] });

      const interceptor = new OpenAIInterceptor(recorder);
      const client = createMockClient();

      const chunks: OpenAIChatCompletionChunk[] = [
        {
          id: 'chatcmpl-123',
          choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
        },
        {
          id: 'chatcmpl-123',
          choices: [{ index: 0, delta: { content: ' world' }, finish_reason: null }],
        },
      ];

      async function* generateChunks() {
        await Promise.resolve();
        for (const chunk of chunks) yield chunk;
      }

      client.chat.completions.create.mockResolvedValue(generateChunks());

      await interceptor.install(client);

      const request: OpenAIChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: true,
      };

      const stream = (await client.chat.completions.create(
        request
      )) as AsyncIterable<OpenAIChatCompletionChunk>;
      const received: OpenAIChatCompletionChunk[] = [];
      for await (const chunk of stream) {
        received.push(chunk);
      }

      expect(received).toHaveLength(2);
      expect(session.trace.spans.length).toBeGreaterThan(0);
      expect(session.trace.spans[0].events.some(e => e.name === 'openai-stream-response')).toBe(
        true
      );

      recorder.stopRecording(session);
    });

    it('should redact sensitive fields in recorded requests', async () => {
      const recorder = new RecordingEngine();
      const session = recorder.startRecording({ name: 'test', providers: ['openai'] });

      const interceptor = new OpenAIInterceptor(recorder);
      const client = createMockClient();

      const response: OpenAIChatCompletion = {
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [{ message: { role: 'assistant', content: 'Ok' }, finish_reason: 'stop' }],
      };

      client.chat.completions.create.mockResolvedValue(response);

      await interceptor.install(client);

      const request: OpenAIChatCompletionCreateParams & { apiKey?: string } = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
        apiKey: 'secret-key',
      };

      await client.chat.completions.create(request);

      const requestEvent = session.trace.spans[0].events.find(e => e.type === 'request');
      expect(requestEvent).toBeDefined();
      expect((requestEvent!.data as Record<string, unknown>).apiKey).toBe('[REDACTED]');

      recorder.stopRecording(session);
    });
  });

  describe('uninstall', () => {
    it('should restore original create method', async () => {
      const interceptor = new OpenAIInterceptor(new RecordingEngine());
      const client = createMockClient();
      const originalCreate = client.chat.completions.create;

      await interceptor.install(client);
      expect(client.chat.completions.create).not.toBe(originalCreate);

      await interceptor.uninstall();
      expect(client.chat.completions.create).toBe(originalCreate);
    });

    it('should be safe to uninstall twice', async () => {
      const interceptor = new OpenAIInterceptor(new RecordingEngine());
      const client = createMockClient();

      await interceptor.install(client);
      await interceptor.uninstall();
      await expect(interceptor.uninstall()).resolves.toBeUndefined();
    });
  });
});
