import type { RecordingEngine } from '@reaatech/agent-replay-core';
import { InterceptorError } from '@reaatech/agent-replay-shared';

import type { LLMProviderAdapter } from './adapter.js';

export type InterceptorInstallationPattern =
  | 'monkey-patch'
  | 'proxy'
  | 'wrapper'
  | 'framework-hook';

export interface InterceptorInstaller {
  detectPattern(): InterceptorInstallationPattern;
  install(pattern?: InterceptorInstallationPattern): Promise<InstallationResult>;
  uninstall(): Promise<void>;
}

export interface InstallationResult {
  success: boolean;
  pattern: InterceptorInstallationPattern;
  interceptedMethods: string[];
}

export abstract class BaseInterceptor {
  protected adapter: LLMProviderAdapter;
  protected recorder: RecordingEngine;

  constructor(adapter: LLMProviderAdapter, recorder: RecordingEngine) {
    this.adapter = adapter;
    this.recorder = recorder;
  }

  abstract install(target: unknown): Promise<InstallationResult>;
  abstract uninstall(): Promise<void>;

  protected redactSensitiveFields(request: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = [
      'apikey',
      'api_key',
      'authorization',
      'x-api-key',
      'token',
      'secret',
      'password',
    ];

    function redact(obj: unknown): unknown {
      if (obj === null || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(redact);
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const lower = key.toLowerCase();
        if (sensitiveKeys.some((k) => lower.includes(k))) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = redact(value);
        }
      }
      return result;
    }

    return redact(request) as Record<string, unknown>;
  }
}

export class InterceptorRegistry {
  private interceptors = new Map<string, BaseInterceptor>();
  private targets = new Map<string, unknown>();

  register(provider: string, interceptor: BaseInterceptor, target?: unknown): void {
    this.interceptors.set(provider, interceptor);
    if (target !== undefined) {
      this.targets.set(provider, target);
    }
  }

  async enable(providers: string[]): Promise<void> {
    for (const provider of providers) {
      const interceptor = this.interceptors.get(provider);
      if (!interceptor) {
        throw new InterceptorError(`No interceptor registered for provider: ${provider}`);
      }
      const target = this.targets.get(provider);
      if (target !== undefined) {
        await interceptor.install(target);
      }
    }
  }

  async disable(): Promise<void> {
    for (const [, interceptor] of this.interceptors) {
      await interceptor.uninstall();
    }
  }
}
