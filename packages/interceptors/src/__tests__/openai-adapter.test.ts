import { describe, expect, it } from 'vitest';

import { OpenAIAdapter } from '../openai-adapter.js';
import type {
  OpenAIChatCompletion,
  OpenAIChatCompletionChunk,
  OpenAIChatCompletionCreateParams,
} from '../openai-adapter.js';

describe('OpenAIAdapter', () => {
  const adapter = new OpenAIAdapter();

  it('should expose provider name', () => {
    expect(adapter.provider).toBe('openai');
  });

  describe('normalizeRequest', () => {
    it('should normalize a chat completion request', () => {
      const native: OpenAIChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        max_tokens: 100,
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.provider).toBe('openai');
      expect(normalized.model).toBe('gpt-4');
      expect(normalized.messages).toHaveLength(1);
      expect(normalized.messages[0].role).toBe('user');
      expect(normalized.messages[0].content).toBe('Hello');
      expect(normalized.temperature).toBe(0.7);
      expect(normalized.maxTokens).toBe(100);
    });

    it('should handle messages with null content', () => {
      const native: OpenAIChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'assistant', content: null }],
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.messages[0].content).toBe('');
    });

    it('should normalize optional parameters', () => {
      const native: OpenAIChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
        top_p: 0.9,
        stop: ['END'],
        stream: true,
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.topP).toBe(0.9);
      expect(normalized.stopSequences).toEqual(['END']);
    });

    it('should handle string stop parameter', () => {
      const native: OpenAIChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
        stop: 'STOP',
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.stopSequences).toEqual(['STOP']);
    });

    it('should handle array stop parameter', () => {
      const native: OpenAIChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
        stop: ['STOP', 'END'],
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.stopSequences).toEqual(['STOP', 'END']);
    });

    it('should handle undefined stop parameter', () => {
      const native: OpenAIChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hi' }],
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.stopSequences).toBeUndefined();
    });

    it('should normalize tools in request', () => {
      const native: OpenAIChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather info',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.tools).toHaveLength(1);
      expect(normalized.tools?.[0].name).toBe('get_weather');
      expect(normalized.tools?.[0].description).toBe('Get weather info');
      expect(normalized.tools?.[0].parameters).toEqual({ type: 'object', properties: {} });
    });

    it('should default tool description and parameters', () => {
      const native: OpenAIChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [
          {
            type: 'function',
            function: { name: 'noop' },
          },
        ],
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.tools?.[0].description).toBe('');
      expect(normalized.tools?.[0].parameters).toEqual({});
    });

    it('should include raw request', () => {
      const native: OpenAIChatCompletionCreateParams = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.raw).toEqual(native as unknown as Record<string, unknown>);
    });
  });

  describe('normalizeResponse', () => {
    it('should normalize a chat completion response', () => {
      const native: OpenAIChatCompletion = {
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hi there!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const normalized = adapter.normalizeResponse(native);
      expect(normalized.id).toBe('chatcmpl-123');
      expect(normalized.model).toBe('gpt-4');
      expect(normalized.content).toBe('Hi there!');
      expect(normalized.finishReason).toBe('stop');
      expect(normalized.usage).toEqual({ prompt: 10, completion: 5, total: 15 });
    });

    it('should handle response with null content', () => {
      const native: OpenAIChatCompletion = {
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
            },
            finish_reason: 'stop',
          },
        ],
      };

      const normalized = adapter.normalizeResponse(native);
      expect(normalized.content).toBe('');
    });

    it('should handle response without usage', () => {
      const native: OpenAIChatCompletion = {
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [
          {
            message: { role: 'assistant', content: 'Hi' },
            finish_reason: 'stop',
          },
        ],
      };

      const normalized = adapter.normalizeResponse(native);
      expect(normalized.usage).toBeUndefined();
    });

    it('should normalize tool calls in response', () => {
      const native: OpenAIChatCompletion = {
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'get_weather', arguments: '{"location":"NYC"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      };

      const normalized = adapter.normalizeResponse(native);
      expect(normalized.toolCalls).toHaveLength(1);
      expect(normalized.toolCalls?.[0].id).toBe('call_1');
      expect(normalized.toolCalls?.[0].name).toBe('get_weather');
      expect(normalized.toolCalls?.[0].arguments).toEqual({ location: 'NYC' });
    });

    it('should include raw response', () => {
      const native: OpenAIChatCompletion = {
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [{ message: { role: 'assistant', content: 'Hi' }, finish_reason: 'stop' }],
      };

      const normalized = adapter.normalizeResponse(native);
      expect(normalized.raw).toEqual(native as unknown as Record<string, unknown>);
    });
  });

  describe('normalizeChunk', () => {
    it('should normalize a stream chunk with content', () => {
      const chunk: OpenAIChatCompletionChunk = {
        id: 'chatcmpl-123',
        choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
      };

      const normalized = adapter.normalizeChunk(chunk);
      expect(normalized.index).toBe(0);
      expect(normalized.delta).toBe('Hello');
      expect(normalized.finishReason).toBeUndefined();
    });

    it('should normalize a stream chunk with null content', () => {
      const chunk: OpenAIChatCompletionChunk = {
        id: 'chatcmpl-123',
        choices: [{ index: 0, delta: { content: null }, finish_reason: null }],
      };

      const normalized = adapter.normalizeChunk(chunk);
      expect(normalized.delta).toBe('');
    });

    it('should normalize a stream chunk with finish reason', () => {
      const chunk: OpenAIChatCompletionChunk = {
        id: 'chatcmpl-123',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      };

      const normalized = adapter.normalizeChunk(chunk);
      expect(normalized.finishReason).toBe('stop');
    });

    it('should include tool call delta', () => {
      const chunk: OpenAIChatCompletionChunk = {
        id: 'chatcmpl-123',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                { index: 0, id: 'call_1', type: 'function', function: { name: 'get_weather' } },
              ],
            },
            finish_reason: null,
          },
        ],
      };

      const normalized = adapter.normalizeChunk(chunk);
      expect(normalized.toolCallDelta).toEqual(chunk.choices[0].delta.tool_calls?.[0]);
    });
  });

  describe('denormalizeRequest', () => {
    it('should denormalize a request', () => {
      const normalized = adapter.normalizeRequest({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
      } as OpenAIChatCompletionCreateParams);

      const denormalized = adapter.denormalizeRequest(normalized) as {
        model: string;
        messages: Array<{ role: string; content: string }>;
        tools?: unknown[];
      };
      expect(denormalized.model).toBe('gpt-4');
      expect(denormalized.messages).toHaveLength(1);
      expect(denormalized.messages[0].role).toBe('user');
      expect(denormalized.messages[0].content).toBe('Test');
    });

    it('should denormalize tools', () => {
      const normalized = adapter.normalizeRequest({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object' },
            },
          },
        ],
      } as OpenAIChatCompletionCreateParams);

      const denormalized = adapter.denormalizeRequest(normalized) as {
        tools: Array<{
          type: string;
          function: { name: string; description: string; parameters: Record<string, unknown> };
        }>;
      };
      expect(denormalized.tools).toHaveLength(1);
      expect(denormalized.tools[0].type).toBe('function');
      expect(denormalized.tools[0].function.name).toBe('get_weather');
    });

    it('should denormalize optional parameters', () => {
      const normalized = adapter.normalizeRequest({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.5,
        max_tokens: 50,
        top_p: 0.9,
        stop: ['END'],
      } as OpenAIChatCompletionCreateParams);

      const denormalized = adapter.denormalizeRequest(normalized) as {
        temperature: number;
        max_tokens: number;
        top_p: number;
        stop: string[];
      };
      expect(denormalized.temperature).toBe(0.5);
      expect(denormalized.max_tokens).toBe(50);
      expect(denormalized.top_p).toBe(0.9);
      expect(denormalized.stop).toEqual(['END']);
    });
  });
});
