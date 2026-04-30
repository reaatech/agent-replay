import { describe, expect, it } from 'vitest';

import { AnthropicAdapter } from '../anthropic-adapter.js';
import type {
  AnthropicMessage,
  AnthropicMessageCreateParams,
  AnthropicMessageStreamEvent,
} from '../anthropic-adapter.js';

describe('AnthropicAdapter', () => {
  const adapter = new AnthropicAdapter();

  it('should expose provider name', () => {
    expect(adapter.provider).toBe('anthropic');
  });

  describe('normalizeRequest', () => {
    it('should normalize a message request', () => {
      const native: AnthropicMessageCreateParams = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.provider).toBe('anthropic');
      expect(normalized.model).toBe('claude-3-5-sonnet-20241022');
      expect(normalized.messages[0].content).toBe('Hello');
      expect(normalized.maxTokens).toBe(100);
    });

    it('should normalize array content into joined string', () => {
      const native: AnthropicMessageCreateParams = {
        model: 'claude-3',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello ' },
              { type: 'text', text: 'world' },
            ],
          },
        ],
        max_tokens: 100,
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.messages[0].content).toBe('Hello world');
    });

    it('should normalize assistant messages', () => {
      const native: AnthropicMessageCreateParams = {
        model: 'claude-3',
        messages: [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello!' },
        ],
        max_tokens: 100,
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.messages).toHaveLength(2);
      expect(normalized.messages[1].role).toBe('assistant');
      expect(normalized.messages[1].content).toBe('Hello!');
    });

    it('should normalize tools', () => {
      const native: AnthropicMessageCreateParams = {
        model: 'claude-3',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [
          { name: 'get_weather', description: 'Get weather', input_schema: { type: 'object' } },
        ],
        max_tokens: 100,
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.tools).toHaveLength(1);
      expect(normalized.tools?.[0].name).toBe('get_weather');
      expect(normalized.tools?.[0].description).toBe('Get weather');
      expect(normalized.tools?.[0].parameters).toEqual({ type: 'object' });
    });

    it('should default tool description and parameters', () => {
      const native: AnthropicMessageCreateParams = {
        model: 'claude-3',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [{ name: 'noop' }],
        max_tokens: 100,
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.tools?.[0].description).toBe('');
      expect(normalized.tools?.[0].parameters).toEqual({});
    });

    it('should normalize optional parameters', () => {
      const native: AnthropicMessageCreateParams = {
        model: 'claude-3',
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0.7,
        top_p: 0.9,
        stop_sequences: ['END'],
        stream: true,
        max_tokens: 200,
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.temperature).toBe(0.7);
      expect(normalized.topP).toBe(0.9);
      expect(normalized.stopSequences).toEqual(['END']);
      expect(normalized.maxTokens).toBe(200);
    });

    it('should include raw request', () => {
      const native: AnthropicMessageCreateParams = {
        model: 'claude-3',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
      };

      const normalized = adapter.normalizeRequest(native);
      expect(normalized.raw).toEqual(native as unknown as Record<string, unknown>);
    });
  });

  describe('normalizeResponse', () => {
    it('should normalize a message response with text content', () => {
      const native: AnthropicMessage = {
        id: 'msg-123',
        model: 'claude-3-5-sonnet-20241022',
        content: [{ type: 'text', text: 'Hi!' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const normalized = adapter.normalizeResponse(native);
      expect(normalized.id).toBe('msg-123');
      expect(normalized.model).toBe('claude-3-5-sonnet-20241022');
      expect(normalized.content).toBe('Hi!');
      expect(normalized.usage).toEqual({ prompt: 10, completion: 5, total: 15 });
      expect(normalized.finishReason).toBe('end_turn');
    });

    it('should concatenate multiple text blocks', () => {
      const native: AnthropicMessage = {
        id: 'msg-123',
        model: 'claude-3',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ],
        stop_reason: 'end_turn',
      };

      const normalized = adapter.normalizeResponse(native);
      expect(normalized.content).toBe('Hello world');
    });

    it('should handle response without usage', () => {
      const native: AnthropicMessage = {
        id: 'msg-123',
        model: 'claude-3',
        content: [{ type: 'text', text: 'Hi!' }],
        stop_reason: 'end_turn',
      };

      const normalized = adapter.normalizeResponse(native);
      expect(normalized.usage).toBeUndefined();
    });

    it('should handle null stop_reason', () => {
      const native: AnthropicMessage = {
        id: 'msg-123',
        model: 'claude-3',
        content: [{ type: 'text', text: 'Hi!' }],
        stop_reason: null,
      };

      const normalized = adapter.normalizeResponse(native);
      expect(normalized.finishReason).toBe('none');
    });

    it('should normalize tool_use content blocks', () => {
      const native: AnthropicMessage = {
        id: 'msg-123',
        model: 'claude-3',
        content: [
          { type: 'text', text: 'Let me check that.' },
          { type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { location: 'NYC' } },
        ],
        stop_reason: 'tool_use',
      };

      const normalized = adapter.normalizeResponse(native);
      expect(normalized.content).toBe('Let me check that.');
      expect(normalized.toolCalls).toHaveLength(1);
      expect(normalized.toolCalls?.[0].id).toBe('toolu_1');
      expect(normalized.toolCalls?.[0].name).toBe('get_weather');
      expect(normalized.toolCalls?.[0].arguments).toEqual({ location: 'NYC' });
    });

    it('should omit toolCalls when there are none', () => {
      const native: AnthropicMessage = {
        id: 'msg-123',
        model: 'claude-3',
        content: [{ type: 'text', text: 'Hi!' }],
        stop_reason: 'end_turn',
      };

      const normalized = adapter.normalizeResponse(native);
      expect(normalized.toolCalls).toBeUndefined();
    });

    it('should include raw response', () => {
      const native: AnthropicMessage = {
        id: 'msg-123',
        model: 'claude-3',
        content: [{ type: 'text', text: 'Hi!' }],
        stop_reason: 'end_turn',
      };

      const normalized = adapter.normalizeResponse(native);
      expect(normalized.raw).toEqual(native as unknown as Record<string, unknown>);
    });
  });

  describe('normalizeChunk', () => {
    it('should normalize text_delta chunk', () => {
      const chunk: AnthropicMessageStreamEvent = {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      };

      const normalized = adapter.normalizeChunk(chunk);
      expect(normalized.index).toBe(0);
      expect(normalized.delta).toBe('Hello');
      expect(normalized.finishReason).toBeUndefined();
    });

    it('should normalize input_json_delta chunk', () => {
      const chunk: AnthropicMessageStreamEvent = {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"loc":' },
      };

      const normalized = adapter.normalizeChunk(chunk);
      expect(normalized.delta).toBe('{"loc":');
    });

    it('should default index to 0 when missing', () => {
      const chunk: AnthropicMessageStreamEvent = {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hi' },
      };

      const normalized = adapter.normalizeChunk(chunk);
      expect(normalized.index).toBe(0);
    });

    it('should include toolCallDelta for tool_use content_block', () => {
      const chunk: AnthropicMessageStreamEvent = {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: {} },
      };

      const normalized = adapter.normalizeChunk(chunk);
      expect(normalized.toolCallDelta).toEqual({
        type: 'tool_use',
        id: 'toolu_1',
        name: 'get_weather',
        input: {},
      });
    });

    it('should not include toolCallDelta for text content_block', () => {
      const chunk: AnthropicMessageStreamEvent = {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: 'Hello' },
      };

      const normalized = adapter.normalizeChunk(chunk);
      expect(normalized.toolCallDelta).toBeUndefined();
    });
  });

  describe('denormalizeRequest', () => {
    it('should denormalize a request', () => {
      const normalized = adapter.normalizeRequest({
        model: 'claude-3',
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 100,
      } as AnthropicMessageCreateParams);

      const denormalized = adapter.denormalizeRequest(normalized) as {
        model: string;
        messages: Array<{ role: string; content: string }>;
        max_tokens: number;
      };
      expect(denormalized.model).toBe('claude-3');
      expect(denormalized.messages).toHaveLength(1);
      expect(denormalized.messages[0].role).toBe('user');
      expect(denormalized.messages[0].content).toBe('Test');
      expect(denormalized.max_tokens).toBe(100);
    });

    it('should denormalize tools', () => {
      const normalized = adapter.normalizeRequest({
        model: 'claude-3',
        messages: [{ role: 'user', content: 'Test' }],
        tools: [
          { name: 'get_weather', description: 'Get weather', input_schema: { type: 'object' } },
        ],
        max_tokens: 100,
      } as AnthropicMessageCreateParams);

      const denormalized = adapter.denormalizeRequest(normalized) as {
        tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
      };
      expect(denormalized.tools).toHaveLength(1);
      expect(denormalized.tools[0].name).toBe('get_weather');
      expect(denormalized.tools[0].input_schema).toEqual({ type: 'object' });
    });

    it('should denormalize optional parameters', () => {
      const normalized = adapter.normalizeRequest({
        model: 'claude-3',
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.5,
        max_tokens: 50,
        top_p: 0.9,
        stop_sequences: ['END'],
      } as AnthropicMessageCreateParams);

      const denormalized = adapter.denormalizeRequest(normalized) as {
        temperature: number;
        max_tokens: number;
        top_p: number;
        stop_sequences: string[];
      };
      expect(denormalized.temperature).toBe(0.5);
      expect(denormalized.max_tokens).toBe(50);
      expect(denormalized.top_p).toBe(0.9);
      expect(denormalized.stop_sequences).toEqual(['END']);
    });
  });
});
