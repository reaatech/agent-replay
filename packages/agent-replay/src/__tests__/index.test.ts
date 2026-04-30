import { describe, expect, it } from 'vitest';

import {
  InterceptorRegistry,
  OpenAIInterceptor,
  RecordingEngine,
  ReplayEngine,
  TraceNotFoundError,
} from '../index.js';

describe('@reaatech/agent-replay', () => {
  it('should re-export RecordingEngine', () => {
    expect(RecordingEngine).toBeDefined();
  });

  it('should re-export ReplayEngine', () => {
    expect(ReplayEngine).toBeDefined();
  });

  it('should re-export OpenAIInterceptor', () => {
    expect(OpenAIInterceptor).toBeDefined();
  });

  it('should re-export InterceptorRegistry', () => {
    expect(InterceptorRegistry).toBeDefined();
  });

  it('should re-export shared errors', () => {
    expect(TraceNotFoundError).toBeDefined();
  });
});
