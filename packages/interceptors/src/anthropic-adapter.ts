import {
  InterceptorError,
  type LLMRequest,
  type LLMResponse,
  type Message,
  type StreamChunk,
  type ToolDefinition,
} from '@reaatech/agent-replay-shared';

import type { LLMProviderAdapter } from './adapter.js';

export interface AnthropicMessageCreateParams {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string | Array<{ type: 'text'; text: string }>;
  }>;
  tools?: Array<{
    name: string;
    description?: string;
    input_schema?: Record<string, unknown>;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop_sequences?: string[];
  stream?: boolean;
}

export interface AnthropicMessage {
  id: string;
  model: string;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >;
  stop_reason: string | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AnthropicMessageStreamEvent {
  type: string;
  index?: number;
  delta?: {
    type: 'text_delta' | 'input_json_delta';
    text?: string;
    partial_json?: string;
  };
  content_block?: {
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
}

export class AnthropicAdapter implements LLMProviderAdapter {
  readonly provider = 'anthropic';

  normalizeRequest(nativeRequest: unknown): LLMRequest {
    if (!nativeRequest || typeof nativeRequest !== 'object') {
      throw new InterceptorError('anthropic', new Error('Request must be an object'));
    }
    const req = nativeRequest as AnthropicMessageCreateParams;
    if (!Array.isArray(req.messages)) {
      throw new InterceptorError('anthropic', new Error('Request must have a messages array'));
    }

    const messages: Message[] = req.messages.map((m) => {
      const content =
        typeof m.content === 'string' ? m.content : m.content.map((c) => c.text).join('');
      return { role: m.role === 'user' ? 'user' : 'assistant', content };
    });

    const tools: ToolDefinition[] | undefined = req.tools?.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      parameters: t.input_schema ?? {},
    }));

    return {
      provider: 'anthropic',
      model: req.model,
      messages,
      tools,
      temperature: req.temperature,
      maxTokens: req.max_tokens,
      topP: req.top_p,
      stopSequences: req.stop_sequences,
      raw: req as unknown as Record<string, unknown>,
    };
  }

  normalizeResponse(nativeResponse: unknown): LLMResponse {
    if (!nativeResponse || typeof nativeResponse !== 'object') {
      throw new InterceptorError('anthropic', new Error('Response must be an object'));
    }
    const res = nativeResponse as AnthropicMessage;
    if (!Array.isArray(res.content)) {
      throw new InterceptorError('anthropic', new Error('Response must have a content array'));
    }
    const textContent = res.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { text: string }).text)
      .join('');

    const toolCalls = res.content
      .filter((c) => c.type === 'tool_use')
      .map((c) => ({
        id: (c as { id: string }).id,
        name: (c as { name: string }).name,
        arguments: (c as { input: Record<string, unknown> }).input,
      }));

    return {
      id: res.id,
      model: res.model,
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: res.usage
        ? {
            prompt: res.usage.input_tokens,
            completion: res.usage.output_tokens,
            total: res.usage.input_tokens + res.usage.output_tokens,
          }
        : undefined,
      finishReason: res.stop_reason ?? 'none',
      raw: res as unknown as Record<string, unknown>,
    };
  }

  normalizeChunk(nativeChunk: unknown): StreamChunk {
    if (!nativeChunk || typeof nativeChunk !== 'object') {
      return { index: 0, delta: '', toolCallDelta: undefined, finishReason: undefined };
    }
    const chunk = nativeChunk as AnthropicMessageStreamEvent;

    return {
      index: chunk.index ?? 0,
      delta: chunk.delta?.text ?? chunk.delta?.partial_json ?? '',
      toolCallDelta: chunk.content_block?.type === 'tool_use' ? chunk.content_block : undefined,
      finishReason: undefined,
    };
  }

  denormalizeRequest(request: LLMRequest): unknown {
    return {
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      tools: request.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
      temperature: request.temperature,
      max_tokens: request.maxTokens ?? 1024,
      top_p: request.topP,
      stop_sequences: request.stopSequences,
    };
  }
}
