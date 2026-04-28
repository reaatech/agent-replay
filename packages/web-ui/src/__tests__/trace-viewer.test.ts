import { describe, it, expect } from 'vitest';
import type { Trace } from '@reaatech/shared';

import { createTraceViewer } from '../trace-viewer.js';

describe('TraceViewer', () => {
  it('should throw for unimplemented viewer', () => {
    const trace: Trace = {
      version: '1.0.0',
      metadata: {
        id: 'test',
        name: 'Test',
        createdAt: Date.now(),
        agentVersion: '1.0.0',
        environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
        tags: [],
        summary: { id: 'test-summary', name: 'Test Summary', spanCount: 0, duration: 0 },
      },
      spans: [],
      checkpoints: [],
      indexes: {
        byId: {},
        byKind: {
          llm_call: [],
          tool_call: [],
          agent_step: [],
          routing_decision: [],
          state_change: [],
          error: [],
        },
      },
    };

    expect(() => createTraceViewer({ trace })).toThrow('Web UI not yet implemented');
  });
});
