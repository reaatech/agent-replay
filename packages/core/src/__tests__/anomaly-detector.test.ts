import { describe, it, expect } from 'vitest';
import type { Trace } from '@reaatech/shared';

import { AnomalyDetector, formatAnomalyReport } from '../anomaly-detector.js';

function createTrace(
  spans: Array<{
    name: string;
    kind: string;
    status?: string;
    startTime?: number;
    endTime?: number;
    events?: Array<{ type: string; data?: unknown }>;
  }>
): Trace {
  return {
    version: '1.0.0',
    metadata: {
      id: 'test',
      name: 'Test',
      createdAt: Date.now(),
      agentVersion: '1.0.0',
      environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
      tags: [],
      summary: { id: 'test', name: 'test', spanCount: spans.length, duration: 10000 },
    },
    spans: spans.map((s, i) => ({
      id: `span-${i}`,
      name: s.name,
      kind: s.kind as 'llm_call' | 'tool_call' | 'agent_step' | 'error',
      startTime: s.startTime ?? i * 1000,
      endTime: s.endTime ?? (s.startTime ?? i * 1000) + 1000,
      status: (s.status as 'ok' | 'error') ?? 'ok',
      events: (s.events ?? []).map((e, j) => ({
        timestamp: (s.startTime ?? i * 1000) + j,
        type: e.type as 'response' | 'request' | 'error',
        name: 'evt',
        attributes: {},
        data: e.data,
      })),
      attributes: {},
      links: [],
    })),
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
}

describe('AnomalyDetector', () => {
  const detector = new AnomalyDetector();

  it('should detect no anomalies in a normal trace', () => {
    const trace = createTrace([
      { name: 'a', kind: 'llm_call' },
      { name: 'b', kind: 'tool_call' },
    ]);

    const report = detector.detect(trace);
    expect(report.severity).toBe('none');
    expect(report.anomalies).toHaveLength(0);
  });

  it('should detect duration spikes', () => {
    const trace = createTrace([{ name: 'slow', kind: 'llm_call', startTime: 0, endTime: 6000 }]);

    const report = detector.detect(trace);
    expect(report.anomalies.some(a => a.type === 'duration_spike')).toBe(true);
  });

  it('should detect high severity for very slow spans', () => {
    const trace = createTrace([
      { name: 'very-slow', kind: 'llm_call', startTime: 0, endTime: 15000 },
    ]);

    const report = detector.detect(trace);
    const spike = report.anomalies.find(a => a.type === 'duration_spike');
    expect(spike?.severity).toBe('high');
  });

  it('should detect error bursts', () => {
    const trace = createTrace([
      { name: 'e1', kind: 'llm_call', status: 'error' },
      { name: 'e2', kind: 'llm_call', status: 'error' },
      { name: 'e3', kind: 'llm_call', status: 'error' },
      { name: 'e4', kind: 'llm_call', status: 'error' },
      { name: 'e5', kind: 'llm_call', status: 'error' },
    ]);

    const report = detector.detect(trace);
    expect(report.anomalies.some(a => a.type === 'error_burst')).toBe(true);
  });

  it('should detect pattern breaks', () => {
    const trace = createTrace([
      { name: 'a', kind: 'llm_call' },
      { name: 'fail', kind: 'llm_call', status: 'error' },
      { name: 'recover', kind: 'llm_call' },
    ]);

    const report = detector.detect(trace);
    expect(report.anomalies.some(a => a.type === 'pattern_break')).toBe(true);
  });

  it('should detect token spikes', () => {
    const trace = createTrace([
      {
        name: 'n1',
        kind: 'llm_call',
        events: [{ type: 'response', data: { usage: { total: 10 } } }],
      },
      {
        name: 'n2',
        kind: 'llm_call',
        events: [{ type: 'response', data: { usage: { total: 10 } } }],
      },
      {
        name: 'n3',
        kind: 'llm_call',
        events: [{ type: 'response', data: { usage: { total: 10 } } }],
      },
      {
        name: 'n4',
        kind: 'llm_call',
        events: [{ type: 'response', data: { usage: { total: 10 } } }],
      },
      {
        name: 'spike',
        kind: 'llm_call',
        events: [{ type: 'response', data: { usage: { total: 500 } } }],
      },
    ]);

    const report = detector.detect(trace);
    expect(report.anomalies.some(a => a.type === 'token_spike')).toBe(true);
  });

  it('should detect loops', () => {
    const spans = [];
    for (let i = 0; i < 20; i++) {
      spans.push({ name: `s${i}`, kind: i % 2 === 0 ? 'llm_call' : 'tool_call' });
    }
    const trace = createTrace(spans);

    const report = detector.detect(trace);
    expect(report.anomalies.some(a => a.type === 'loop_detected')).toBe(true);
  });

  it('should compute overall severity', () => {
    const criticalTrace = createTrace([
      { name: 'e1', kind: 'llm_call', status: 'error' },
      { name: 'e2', kind: 'llm_call', status: 'error' },
      { name: 'e3', kind: 'llm_call', status: 'error' },
      { name: 'e4', kind: 'llm_call', status: 'error' },
      { name: 'e5', kind: 'llm_call', status: 'error' },
      { name: 'e6', kind: 'llm_call', status: 'error' },
      { name: 'e7', kind: 'llm_call', status: 'error' },
      { name: 'e8', kind: 'llm_call', status: 'error' },
    ]);

    const report = detector.detect(criticalTrace);
    expect(report.severity).toBe('critical');
  });

  it('should format anomaly report', () => {
    const trace = createTrace([{ name: 'slow', kind: 'llm_call', startTime: 0, endTime: 6000 }]);

    const report = detector.detect(trace);
    const formatted = formatAnomalyReport(report);
    expect(formatted).toContain('Anomaly Report');
    expect(formatted).toContain('duration_spike');
  });
});
