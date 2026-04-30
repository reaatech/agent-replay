import type { Trace } from '@reaatech/agent-replay-shared';
import { describe, expect, it } from 'vitest';

import { ReplayDebugger, formatDebugSession } from '../debugger.js';

function createTestTrace(): Trace {
  return {
    version: '1.0.0',
    metadata: {
      id: 'debug-trace',
      name: 'Debug Trace',
      createdAt: Date.now(),
      agentVersion: '1.0.0',
      environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
      tags: [],
      summary: { id: 'test', name: 'test', spanCount: 4, duration: 4000 },
    },
    spans: [
      {
        id: 'span-0',
        name: 'llm-greeting',
        kind: 'llm_call',
        startTime: 0,
        endTime: 1000,
        status: 'ok',
        events: [
          {
            timestamp: 1000,
            type: 'response' as const,
            name: 'resp',
            attributes: {},
            data: { content: 'Hello' },
          },
        ],
        attributes: {},
        links: [],
      },
      {
        id: 'span-1',
        name: 'tool-search',
        kind: 'tool_call',
        startTime: 1000,
        endTime: 2000,
        status: 'ok',
        events: [
          {
            timestamp: 2000,
            type: 'request' as const,
            name: 'req',
            attributes: {},
            data: { name: 'search' },
          },
        ],
        attributes: {},
        links: [],
      },
      {
        id: 'span-2',
        name: 'llm-followup',
        kind: 'llm_call',
        startTime: 2000,
        endTime: 3000,
        status: 'ok',
        events: [
          {
            timestamp: 3000,
            type: 'response' as const,
            name: 'resp',
            attributes: {},
            data: { content: 'Results found' },
          },
        ],
        attributes: {},
        links: [],
      },
      {
        id: 'span-3',
        name: 'error-step',
        kind: 'error',
        startTime: 3000,
        endTime: 4000,
        status: 'error',
        events: [
          {
            timestamp: 4000,
            type: 'error' as const,
            name: 'err',
            attributes: {},
            data: { message: 'Something went wrong' },
          },
        ],
        attributes: {},
        links: [],
      },
    ],
    checkpoints: [
      {
        id: 'cp-1',
        spanId: 'span-1',
        timestamp: 2000,
        state: {
          variables: { count: 1 },
          memory: { entries: [] },
          conversation: { messages: [] },
          toolRegistry: { tools: [] },
        },
        context: { sessionId: 'test', variables: { step: 1 } },
        metadata: { name: 'after-search' },
      },
    ],
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
}

describe('ReplayDebugger', () => {
  const trace = createTestTrace();

  it('should start a debug session', () => {
    const debugger_ = new ReplayDebugger(trace);
    const session = debugger_.start();

    expect(session.trace).toBe(trace);
    expect(session.currentStep).toBe(-1);
    expect(session.history).toHaveLength(0);
  });

  it('should step forward through spans', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.start();

    const snap0 = await debugger_.stepForward();
    expect(snap0).not.toBeNull();
    expect(snap0?.step).toBe(0);
    expect(snap0?.span.name).toBe('llm-greeting');

    const snap1 = await debugger_.stepForward();
    expect(snap1?.step).toBe(1);
    expect(snap1?.span.name).toBe('tool-search');
  });

  it('should return null when stepping past the end', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.start();

    for (let i = 0; i < trace.spans.length; i++) {
      await debugger_.stepForward();
    }

    const pastEnd = await debugger_.stepForward();
    expect(pastEnd).toBeNull();
  });

  it('should step backward', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.start();

    await debugger_.stepForward();
    await debugger_.stepForward();
    expect(debugger_.getSession().currentStep).toBe(1);

    const back = debugger_.stepBackward();
    expect(back).not.toBeNull();
    expect(back?.step).toBe(0);
    expect(debugger_.getSession().currentStep).toBe(0);
  });

  it('should return null when stepping backward past beginning', () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.start();

    const back = debugger_.stepBackward();
    expect(back).toBeNull();
  });

  it('should jump to a checkpoint', () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.start();

    const snap = debugger_.goToCheckpoint('cp-1');
    expect(snap).not.toBeNull();
    expect(snap?.span.name).toBe('tool-search');
  });

  it('should return null for missing checkpoint', () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.start();

    const snap = debugger_.goToCheckpoint('missing');
    expect(snap).toBeNull();
  });

  it('should hit breakpoints by kind', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.addBreakpoint({ kind: 'tool_call' });

    const hits: Array<{ step: number; spanName: string }> = [];
    debugger_.setBreakpointHandler((hit) => {
      hits.push({ step: hit.step, spanName: hit.span.name });
      return true; // pause
    });

    debugger_.start();
    await debugger_.continue();

    expect(hits).toHaveLength(1);
    expect(hits[0].step).toBe(1);
    expect(hits[0].spanName).toBe('tool-search');
  });

  it('should hit breakpoints by name', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.addBreakpoint({ name: 'llm-followup' });

    const hits: number[] = [];
    debugger_.setBreakpointHandler((hit) => {
      hits.push(hit.step);
      return true;
    });

    debugger_.start();
    await debugger_.continue();

    expect(hits).toContain(2);
  });

  it('should hit breakpoints by step index', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.addBreakpoint({ stepIndex: 0 });

    const hits: number[] = [];
    debugger_.setBreakpointHandler((hit) => {
      hits.push(hit.step);
      return true;
    });

    debugger_.start();
    await debugger_.continue();

    expect(hits).toContain(0);
  });

  it('should hit breakpoints by custom predicate', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.addBreakpoint({
      predicate: (span) => span.status === 'error',
    });

    const hits: number[] = [];
    debugger_.setBreakpointHandler((hit) => {
      hits.push(hit.step);
      return true;
    });

    debugger_.start();
    await debugger_.continue();

    expect(hits).toContain(3);
  });

  it('should continue past breakpoints that return false', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.addBreakpoint({ kind: 'llm_call' });

    let hitCount = 0;
    debugger_.setBreakpointHandler(() => {
      hitCount++;
      return false; // don't pause
    });

    debugger_.start();
    await debugger_.continue();

    expect(hitCount).toBe(2); // two llm_call spans
    expect(debugger_.getSession().currentStep).toBe(trace.spans.length - 1);
  });

  it('should toggle breakpoints', () => {
    const debugger_ = new ReplayDebugger(trace);
    const bp = debugger_.addBreakpoint({ kind: 'llm_call' });
    expect(bp.enabled).toBe(true);

    debugger_.toggleBreakpoint(bp.id);
    expect(debugger_.getSession().breakpoints[0].enabled).toBe(false);
  });

  it('should remove breakpoints', () => {
    const debugger_ = new ReplayDebugger(trace);
    const bp = debugger_.addBreakpoint({ kind: 'llm_call' });
    expect(debugger_.getSession().breakpoints).toHaveLength(1);

    debugger_.removeBreakpoint(bp.id);
    expect(debugger_.getSession().breakpoints).toHaveLength(0);
  });

  it('should evaluate watch expressions', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.addWatchpoint('span.name');
    debugger_.addWatchpoint('variables.count');

    debugger_.start();
    await debugger_.runToCompletion();

    const results = debugger_.evaluateWatchpoints();
    expect(results).toHaveLength(2);

    const nameWatch = results.find((r) => r.expression === 'span.name');
    expect(nameWatch).toBeDefined();
    expect(nameWatch?.values).toHaveLength(trace.spans.length);
    expect(nameWatch?.changes.length).toBeGreaterThan(0);
  });

  it('should inspect variables at current step', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.start();
    await debugger_.stepForward();
    await debugger_.stepForward();

    const vars = debugger_.inspectVariables();
    expect(vars.step).toBe(1);
    expect(vars.spanKind).toBe('tool_call');
  });

  it('should inspect events at current step', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.start();
    await debugger_.stepForward();

    const events = debugger_.inspectEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('response');
  });

  it('should format a debug session', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.start();
    await debugger_.stepForward();

    const formatted = formatDebugSession(debugger_.getSession());
    expect(formatted).toContain('Debug Session: Debug Trace');
    expect(formatted).toContain('Current step: 1 / 4');
  });

  it('should run to completion', async () => {
    const debugger_ = new ReplayDebugger(trace);
    const { session, watchResults } = await debugger_.runToCompletion();

    expect(session.currentStep).toBe(trace.spans.length - 1);
    expect(session.history).toHaveLength(trace.spans.length);
    expect(watchResults).toHaveLength(0); // no watchpoints added
  });

  it('should go to step already at current position', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.start();
    await debugger_.stepForward();

    const snap = debugger_.goToStep(0);
    expect(snap).not.toBeNull();
    expect(snap?.step).toBe(0);
  });

  it('should return empty variables when no history', () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.start();
    expect(debugger_.inspectVariables()).toEqual({});
  });

  it('should return empty events when no history', () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.start();
    expect(debugger_.inspectEvents()).toHaveLength(0);
  });

  it('should format debug session at end', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.start();
    for (let i = 0; i < trace.spans.length; i++) {
      await debugger_.stepForward();
    }

    const formatted = formatDebugSession(debugger_.getSession());
    expect(formatted).toContain('Debug Session: Debug Trace');
  });

  it('should match breakpoint with regex name', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.addBreakpoint({ name: /llm-.*up/ });

    const hits: number[] = [];
    debugger_.setBreakpointHandler((hit) => {
      hits.push(hit.step);
      return true;
    });

    debugger_.start();
    await debugger_.continue();

    expect(hits).toContain(2);
  });

  it('should goToStep backward', () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.start();
    debugger_.goToStep(2);
    expect(debugger_.getSession().currentStep).toBe(2);

    const snap = debugger_.goToStep(0);
    expect(snap).not.toBeNull();
    expect(snap?.step).toBe(0);
  });

  it('should format session with breakpoint hits', async () => {
    const debugger_ = new ReplayDebugger(trace);
    debugger_.addBreakpoint({ stepIndex: 0 });
    debugger_.setBreakpointHandler(() => true);
    debugger_.start();
    await debugger_.continue();

    const formatted = formatDebugSession(debugger_.getSession());
    expect(formatted).toContain('Breakpoint hits');
  });
});
