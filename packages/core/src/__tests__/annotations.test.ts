import { describe, it, expect } from 'vitest';
import type { Trace } from '@reaatech/shared';

import { AnnotationManager, formatAnnotations } from '../annotations.js';

function createAnnotatedTrace(): Trace {
  return {
    version: '1.0.0',
    metadata: {
      id: 'ann-trace',
      name: 'Annotated Trace',
      createdAt: Date.now(),
      agentVersion: '1.0.0',
      environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
      tags: [],
      summary: { id: 'test', name: 'test', spanCount: 2, duration: 2000 },
    },
    spans: [
      {
        id: 'span-0',
        name: 'step-1',
        kind: 'llm_call',
        startTime: 0,
        endTime: 1000,
        status: 'ok',
        events: [
          {
            timestamp: 1000,
            type: 'annotation' as const,
            name: 'ann-0',
            attributes: { author: 'alice', severity: 'warning', tags: ['review'] },
            data: { spanId: 'span-0', content: 'Check this output' },
          },
        ],
        attributes: {},
        links: [],
      },
      {
        id: 'span-1',
        name: 'step-2',
        kind: 'tool_call',
        startTime: 1000,
        endTime: 2000,
        status: 'ok',
        events: [],
        attributes: {},
        links: [],
      },
    ],
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

describe('AnnotationManager', () => {
  it('should add an annotation', () => {
    const mgr = new AnnotationManager();
    const ann = mgr.add({
      spanId: 'span-1',
      content: 'This tool call looks suspicious',
      author: 'bob',
      severity: 'warning',
      tags: ['security'],
    });

    expect(ann.id).toBeDefined();
    expect(ann.createdAt).toBeGreaterThan(0);
    expect(ann.content).toBe('This tool call looks suspicious');
    expect(mgr.list()).toHaveLength(1);
  });

  it('should remove an annotation', () => {
    const mgr = new AnnotationManager();
    const ann = mgr.add({ spanId: 's1', content: 'test', author: 'a', tags: [] });
    expect(mgr.remove(ann.id)).toBe(true);
    expect(mgr.list()).toHaveLength(0);
    expect(mgr.remove('missing')).toBe(false);
  });

  it('should update an annotation', () => {
    const mgr = new AnnotationManager();
    const ann = mgr.add({ spanId: 's1', content: 'old', author: 'a', tags: [] });
    const updated = mgr.update(ann.id, { content: 'new', severity: 'critical' });

    expect(updated).not.toBeNull();
    expect(updated!.content).toBe('new');
    expect(updated!.severity).toBe('critical');
    expect(mgr.update('missing', { content: 'x' })).toBeNull();
  });

  it('should get an annotation by id', () => {
    const mgr = new AnnotationManager();
    const ann = mgr.add({ spanId: 's1', content: 'test', author: 'a', tags: [] });
    expect(mgr.get(ann.id)).toBe(ann);
    expect(mgr.get('missing')).toBeUndefined();
  });

  it('should list all annotations', () => {
    const mgr = new AnnotationManager();
    mgr.add({ spanId: 's1', content: 'a1', author: 'alice', tags: [] });
    mgr.add({ spanId: 's2', content: 'a2', author: 'bob', tags: [] });
    expect(mgr.list()).toHaveLength(2);
  });

  it('should filter by spanId', () => {
    const mgr = new AnnotationManager();
    mgr.add({ spanId: 's1', content: 'a1', author: 'a', tags: [] });
    mgr.add({ spanId: 's2', content: 'a2', author: 'a', tags: [] });

    expect(mgr.list({ spanId: 's1' })).toHaveLength(1);
    expect(mgr.list({ spanId: 's1' })[0].content).toBe('a1');
  });

  it('should filter by author', () => {
    const mgr = new AnnotationManager();
    mgr.add({ spanId: 's1', content: 'a1', author: 'alice', tags: [] });
    mgr.add({ spanId: 's2', content: 'a2', author: 'bob', tags: [] });

    expect(mgr.list({ author: 'alice' })).toHaveLength(1);
  });

  it('should filter by severity', () => {
    const mgr = new AnnotationManager();
    mgr.add({ spanId: 's1', content: 'a1', author: 'a', severity: 'warning', tags: [] });
    mgr.add({ spanId: 's2', content: 'a2', author: 'a', severity: 'critical', tags: [] });

    expect(mgr.list({ severity: 'critical' })).toHaveLength(1);
  });

  it('should filter by tags', () => {
    const mgr = new AnnotationManager();
    mgr.add({ spanId: 's1', content: 'a1', author: 'a', tags: ['bug'] });
    mgr.add({ spanId: 's2', content: 'a2', author: 'a', tags: ['feature'] });
    mgr.add({ spanId: 's3', content: 'a3', author: 'a', tags: ['bug', 'urgent'] });

    expect(mgr.list({ tags: ['bug'] })).toHaveLength(2);
  });

  it('should filter by content substring', () => {
    const mgr = new AnnotationManager();
    mgr.add({ spanId: 's1', content: 'Hello world', author: 'a', tags: [] });
    mgr.add({ spanId: 's2', content: 'Goodbye', author: 'a', tags: [] });

    expect(mgr.list({ contentContains: 'world' })).toHaveLength(1);
  });

  it('should get annotations for a specific span', () => {
    const mgr = new AnnotationManager();
    mgr.add({ spanId: 's1', content: 'a1', author: 'a', tags: [] });
    mgr.add({ spanId: 's1', content: 'a2', author: 'a', tags: [] });
    mgr.add({ spanId: 's2', content: 'a3', author: 'a', tags: [] });

    expect(mgr.getForSpan('s1')).toHaveLength(2);
  });

  it('should count by severity', () => {
    const mgr = new AnnotationManager();
    mgr.add({ spanId: 's1', content: 'a1', author: 'a', severity: 'info', tags: [] });
    mgr.add({ spanId: 's2', content: 'a2', author: 'a', severity: 'warning', tags: [] });
    mgr.add({ spanId: 's3', content: 'a3', author: 'a', severity: 'warning', tags: [] });

    const counts = mgr.countBySeverity();
    expect(counts.info).toBe(1);
    expect(counts.warning).toBe(2);
    expect(counts.critical).toBe(0);
  });

  it('should convert annotations to events', () => {
    const mgr = new AnnotationManager();
    mgr.add({
      spanId: 's1',
      content: 'test',
      author: 'alice',
      severity: 'critical',
      tags: ['bug'],
    });

    const events = mgr.toEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('annotation');
    expect(events[0].attributes.author).toBe('alice');
    expect(events[0].attributes.severity).toBe('critical');
    expect((events[0].data as { content: string }).content).toBe('test');
  });

  it('should load annotations from a trace', () => {
    const trace = createAnnotatedTrace();
    const mgr = new AnnotationManager();
    mgr.loadFromTrace(trace);

    expect(mgr.list()).toHaveLength(1);
    expect(mgr.list()[0].author).toBe('alice');
    expect(mgr.list()[0].content).toBe('Check this output');
  });

  it('should clear all annotations', () => {
    const mgr = new AnnotationManager();
    mgr.add({ spanId: 's1', content: 'a1', author: 'a', tags: [] });
    mgr.clear();
    expect(mgr.list()).toHaveLength(0);
  });

  it('should format annotations', () => {
    const mgr = new AnnotationManager();
    mgr.add({
      spanId: 's1',
      content: 'test',
      author: 'alice',
      severity: 'warning',
      tags: ['review'],
    });

    const formatted = formatAnnotations(mgr.list());
    expect(formatted).toContain('Annotations (1)');
    expect(formatted).toContain('[WARNING]');
    expect(formatted).toContain('alice');
  });

  it('should format empty annotations', () => {
    expect(formatAnnotations([])).toBe('No annotations.');
  });

  it('should handle loadFromTrace with missing data', () => {
    const trace: Trace = {
      version: '1.0.0',
      metadata: {
        id: 'ann-trace',
        name: 'Annotated Trace',
        createdAt: Date.now(),
        agentVersion: '1.0.0',
        environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
        tags: [],
        summary: { id: 'test', name: 'test', spanCount: 1, duration: 1000 },
      },
      spans: [
        {
          id: 'span-0',
          name: 'step-1',
          kind: 'llm_call',
          startTime: 0,
          endTime: 1000,
          status: 'ok',
          events: [
            {
              timestamp: 1000,
              type: 'annotation' as const,
              name: 'ann-0',
              attributes: { author: 'alice', severity: 'warning', tags: ['review'] },
              data: undefined,
            },
          ],
          attributes: {},
          links: [],
        },
      ],
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

    const mgr = new AnnotationManager();
    mgr.loadFromTrace(trace);
    expect(mgr.list()).toHaveLength(0);
  });

  it('should count none severity', () => {
    const mgr = new AnnotationManager();
    mgr.add({ spanId: 's1', content: 'a1', author: 'a', tags: [] });
    const counts = mgr.countBySeverity();
    expect(counts.none).toBe(1);
  });
});
