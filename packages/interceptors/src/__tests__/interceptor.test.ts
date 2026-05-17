import { RecordingEngine } from '@reaatech/agent-replay-core';
import {
  InterceptorError,
  type LLMRequest,
  type LLMResponse,
  type StreamChunk,
} from '@reaatech/agent-replay-shared';
import { describe, expect, it, vi } from 'vitest';

import type { LLMProviderAdapter } from '../adapter.js';
import type { InstallationResult } from '../interceptor.js';
import { BaseInterceptor, InterceptorRegistry } from '../interceptor.js';

// Concrete subclass for testing BaseInterceptor
class TestInterceptor extends BaseInterceptor {
  async install(_target: unknown): Promise<InstallationResult> {
    await Promise.resolve();
    return { success: true, pattern: 'monkey-patch', interceptedMethods: [] };
  }

  async uninstall(): Promise<void> {
    return Promise.resolve();
  }

  exposeRedact(request: Record<string, unknown>): Record<string, unknown> {
    return this.redactSensitiveFields(request);
  }
}

const mockAdapter: LLMProviderAdapter = {
  provider: 'test',
  normalizeRequest: (_req: unknown) => ({}) as LLMRequest,
  normalizeResponse: (_res: unknown) => ({}) as LLMResponse,
  normalizeChunk: (_chunk: unknown) => ({}) as StreamChunk,
  denormalizeRequest: (_req: LLMRequest) => ({}) as unknown,
};

describe('BaseInterceptor', () => {
  it('should store adapter and recorder in constructor', () => {
    const recorder = new RecordingEngine();
    const interceptor = new TestInterceptor(mockAdapter, recorder);

    expect((interceptor as unknown as { adapter: LLMProviderAdapter }).adapter).toBe(mockAdapter);
    expect((interceptor as unknown as { recorder: RecordingEngine }).recorder).toBe(recorder);
  });

  describe('redactSensitiveFields', () => {
    it('should redact apiKey', () => {
      const interceptor = new TestInterceptor(mockAdapter, new RecordingEngine());
      const result = interceptor.exposeRedact({ apiKey: 'secret123', model: 'gpt-4' });
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.model).toBe('gpt-4');
    });

    it('should redact api_key', () => {
      const interceptor = new TestInterceptor(mockAdapter, new RecordingEngine());
      const result = interceptor.exposeRedact({ api_key: 'secret123' });
      expect(result.api_key).toBe('[REDACTED]');
    });

    it('should redact authorization', () => {
      const interceptor = new TestInterceptor(mockAdapter, new RecordingEngine());
      const result = interceptor.exposeRedact({ authorization: 'Bearer token' });
      expect(result.authorization).toBe('[REDACTED]');
    });

    it('should redact x-api-key', () => {
      const interceptor = new TestInterceptor(mockAdapter, new RecordingEngine());
      const result = interceptor.exposeRedact({ 'x-api-key': 'secret123' });
      expect(result['x-api-key']).toBe('[REDACTED]');
    });

    it('should redact multiple sensitive fields at once', () => {
      const interceptor = new TestInterceptor(mockAdapter, new RecordingEngine());
      const result = interceptor.exposeRedact({
        apiKey: 'secret1',
        api_key: 'secret2',
        authorization: 'Bearer token',
        'x-api-key': 'secret3',
        model: 'gpt-4',
      });
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.api_key).toBe('[REDACTED]');
      expect(result.authorization).toBe('[REDACTED]');
      expect(result['x-api-key']).toBe('[REDACTED]');
      expect(result.model).toBe('gpt-4');
    });

    it('should not mutate the original object', () => {
      const interceptor = new TestInterceptor(mockAdapter, new RecordingEngine());
      const original = { apiKey: 'secret123' };
      const result = interceptor.exposeRedact(original);
      expect(original.apiKey).toBe('secret123');
      expect(result.apiKey).toBe('[REDACTED]');
    });

    it('should leave non-sensitive fields unchanged', () => {
      const interceptor = new TestInterceptor(mockAdapter, new RecordingEngine());
      const result = interceptor.exposeRedact({ model: 'gpt-4', temperature: 0.7 });
      expect(result.model).toBe('gpt-4');
      expect(result.temperature).toBe(0.7);
    });
  });
});

describe('InterceptorRegistry', () => {
  it('should register and enable interceptors with targets', async () => {
    const registry = new InterceptorRegistry();
    const interceptor = new TestInterceptor(mockAdapter, new RecordingEngine());
    const installSpy = vi.spyOn(interceptor, 'install');

    registry.register('test', interceptor, { target: true });
    await registry.enable(['test']);

    expect(installSpy).toHaveBeenCalledWith({ target: true });
  });

  it('should enable without installing when no target is provided', async () => {
    const registry = new InterceptorRegistry();
    const interceptor = new TestInterceptor(mockAdapter, new RecordingEngine());
    const installSpy = vi.spyOn(interceptor, 'install');

    registry.register('test', interceptor);
    await registry.enable(['test']);

    expect(installSpy).not.toHaveBeenCalled();
  });

  it('should throw when enabling unregistered provider', async () => {
    const registry = new InterceptorRegistry();
    await expect(registry.enable(['unknown'])).rejects.toThrow(InterceptorError);
  });

  it('should uninstall all interceptors on disable', async () => {
    const registry = new InterceptorRegistry();
    const interceptor1 = new TestInterceptor(mockAdapter, new RecordingEngine());
    const interceptor2 = new TestInterceptor(mockAdapter, new RecordingEngine());

    const spy1 = vi.spyOn(interceptor1, 'uninstall');
    const spy2 = vi.spyOn(interceptor2, 'uninstall');

    registry.register('provider1', interceptor1);
    registry.register('provider2', interceptor2);

    await registry.disable();

    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
  });
});
