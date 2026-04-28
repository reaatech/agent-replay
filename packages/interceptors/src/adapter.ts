import { type LLMRequest, type LLMResponse, type StreamChunk } from '@reaatech/shared';

export interface LLMProviderAdapter {
  readonly provider: string;

  normalizeRequest(nativeRequest: unknown): LLMRequest;
  normalizeResponse(nativeResponse: unknown): LLMResponse;
  normalizeChunk(nativeChunk: unknown): StreamChunk;
  denormalizeRequest(request: LLMRequest): unknown;
}
