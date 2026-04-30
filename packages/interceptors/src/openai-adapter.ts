import {
  InterceptorError,
  type LLMRequest,
  type LLMResponse,
  type Message,
  type StreamChunk,
  type ToolDefinition,
} from '@reaatech/agent-replay-shared';

import type { LLMProviderAdapter } from './adapter.js';

export interface OpenAIChatCompletionCreateParams {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }>;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
}

export interface OpenAIChatCompletion {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIChatCompletionChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason: string | null;
  }>;
}

export class OpenAIAdapter implements LLMProviderAdapter {
  readonly provider = 'openai';

  normalizeRequest(nativeRequest: unknown): LLMRequest {
    if (!nativeRequest || typeof nativeRequest !== 'object') {
      throw new InterceptorError('openai', new Error('Request must be an object'));
    }
    const req = nativeRequest as OpenAIChatCompletionCreateParams;
    if (!Array.isArray(req.messages)) {
      throw new InterceptorError('openai', new Error('Request must have a messages array'));
    }

    const messages: Message[] = req.messages.map((m) => ({
      role: m.role,
      content: m.content ?? '',
      toolCalls: m.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      })),
      toolCallId: m.tool_call_id,
    }));

    const tools: ToolDefinition[] | undefined = req.tools?.map((t) => ({
      name: t.function.name,
      description: t.function.description ?? '',
      parameters: t.function.parameters ?? {},
    }));

    return {
      provider: 'openai',
      model: req.model,
      messages,
      tools,
      temperature: req.temperature,
      maxTokens: req.max_tokens,
      topP: req.top_p,
      stopSequences: Array.isArray(req.stop) ? req.stop : req.stop ? [req.stop] : undefined,
      raw: req as unknown as Record<string, unknown>,
    };
  }

  normalizeResponse(nativeResponse: unknown): LLMResponse {
    if (!nativeResponse || typeof nativeResponse !== 'object') {
      throw new InterceptorError('openai', new Error('Response must be an object'));
    }
    const res = nativeResponse as OpenAIChatCompletion;
    if (!Array.isArray(res.choices) || res.choices.length === 0) {
      throw new InterceptorError('openai', new Error('Response must have choices array'));
    }
    const choice = res.choices[0];

    return {
      id: res.id,
      model: res.model,
      content: choice.message.content ?? '',
      toolCalls: choice.message.tool_calls?.map((t) => ({
        id: t.id,
        name: t.function.name,
        arguments: (() => {
          try {
            return JSON.parse(t.function.arguments) as Record<string, unknown>;
          } catch {
            return { _raw_unparseable: t.function.arguments } as Record<string, unknown>;
          }
        })(),
      })),
      usage: res.usage
        ? {
            prompt: res.usage.prompt_tokens,
            completion: res.usage.completion_tokens,
            total: res.usage.total_tokens,
          }
        : undefined,
      finishReason: choice.finish_reason,
      raw: res as unknown as Record<string, unknown>,
    };
  }

  normalizeChunk(nativeChunk: unknown): StreamChunk {
    if (!nativeChunk || typeof nativeChunk !== 'object') {
      return { index: 0, delta: '', toolCallDelta: undefined, finishReason: undefined };
    }
    const chunk = nativeChunk as OpenAIChatCompletionChunk;
    const choice = chunk.choices[0];

    return {
      index: choice.index,
      delta: choice.delta.content ?? '',
      toolCallDelta: choice.delta.tool_calls?.[0],
      finishReason: choice.finish_reason ?? undefined,
    };
  }

  denormalizeRequest(request: LLMRequest): unknown {
    return {
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
        tool_calls: m.toolCalls?.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
        tool_call_id: m.toolCallId,
      })),
      tools: request.tools?.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      top_p: request.topP,
      stop: request.stopSequences,
    };
  }
}
