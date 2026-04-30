import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { LocalFileStorage } from '@reaatech/agent-replay-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { debug } from '../commands/debug.js';
import { diff } from '../commands/diff.js';
import { explore } from '../commands/explore.js';
import { record } from '../commands/record.js';
import { replay } from '../commands/replay.js';

const TEST_TRACES_DIR = join(process.cwd(), 'traces');

function createTestTrace(id: string): Record<string, unknown> {
  return {
    version: '1.0.0',
    metadata: {
      id,
      name: `Test ${id}`,
      createdAt: Date.now(),
      agentVersion: '1.0.0',
      environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
      tags: [],
      summary: { spanCount: 1, duration: 100 },
    },
    spans: [
      {
        id: 'span-1',
        name: 'llm-call',
        kind: 'llm_call',
        startTime: Date.now(),
        endTime: Date.now() + 100,
        status: 'ok',
        events: [
          {
            timestamp: Date.now() + 100,
            type: 'response',
            name: 'resp',
            attributes: {},
            data: { content: 'Hello' },
          },
        ],
        attributes: {},
        links: [],
      },
    ],
    checkpoints: [],
    indexes: {
      byId: { 'span-1': 0 },
      byKind: {
        llm_call: [0],
        tool_call: [],
        agent_step: [],
        routing_decision: [],
        state_change: [],
        error: [],
      },
    },
  };
}

describe('CLI action handlers', () => {
  const logs: string[] = [];
  const errors: string[] = [];

  beforeEach(async () => {
    await mkdir(TEST_TRACES_DIR, { recursive: true });
    logs.length = 0;
    errors.length = 0;
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.join(' '));
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    try {
      await rm(TEST_TRACES_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('record', () => {
    it('should register signal handlers and save on SIGINT', async () => {
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((_code?: string | number | null | undefined) => undefined as never);
      const onSpy = vi.spyOn(process, 'on');

      const outputDir = join(TEST_TRACES_DIR, 'record-test');
      await mkdir(outputDir, { recursive: true });

      void record({ output: outputDir, name: 'test-rec', providers: 'openai', state: true });

      await new Promise((r) => setTimeout(r, 50));

      const sigintHandler = onSpy.mock.calls.find((c) => c[0] === 'SIGINT')?.[1] as
        | (() => Promise<void>)
        | undefined;
      await sigintHandler?.();

      expect(logs.some((l) => l.includes('Trace saved:'))).toBe(true);
      exitSpy.mockRestore();
    });

    it('should handle save errors gracefully', async () => {
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((_code?: string | number | null | undefined) => undefined as never);
      const onSpy = vi.spyOn(process, 'on');
      const saveSpy = vi
        .spyOn(LocalFileStorage.prototype, 'save')
        .mockRejectedValue(new Error('disk full'));

      const outputDir = join(TEST_TRACES_DIR, 'record-error');
      await mkdir(outputDir, { recursive: true });

      void record({ output: outputDir, name: 'test-rec', providers: 'openai', state: true });

      await new Promise((r) => setTimeout(r, 50));

      const sigintHandler = onSpy.mock.calls.find((c) => c[0] === 'SIGINT')?.[1] as
        | (() => Promise<void>)
        | undefined;
      await sigintHandler?.();

      expect(errors.some((e) => e.includes('Failed to save trace'))).toBe(true);

      saveSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });

  describe('replay', () => {
    it('should replay a trace in stubbed mode', async () => {
      const trace = createTestTrace('replay-test');
      await writeFile(
        join(TEST_TRACES_DIR, 'replay-test.artrace.json'),
        JSON.stringify(trace),
        'utf-8',
      );

      await replay({ trace: 'replay-test', mode: 'stubbed', progress: false });

      expect(logs.some((l) => l.includes('Replay complete'))).toBe(true);
    });

    it('should show progress when requested', async () => {
      const trace = createTestTrace('replay-progress');
      await writeFile(
        join(TEST_TRACES_DIR, 'replay-progress.artrace.json'),
        JSON.stringify(trace),
        'utf-8',
      );

      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      await replay({ trace: 'replay-progress', mode: 'stubbed', progress: true });

      expect(writeSpy).toHaveBeenCalled();
      writeSpy.mockRestore();
    });

    it('should error for partial mode without checkpoint', async () => {
      const exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: string | number | null | undefined) => {
          throw new Error(`EXIT:${String(code)}`);
        });
      const trace = createTestTrace('replay-partial');
      await writeFile(
        join(TEST_TRACES_DIR, 'replay-partial.artrace.json'),
        JSON.stringify(trace),
        'utf-8',
      );

      await expect(
        replay({ trace: 'replay-partial', mode: 'partial', progress: false }),
      ).rejects.toThrow('EXIT:1');
      expect(errors.some((e) => e.includes('--checkpoint is required'))).toBe(true);
      exitSpy.mockRestore();
    });
  });

  describe('explore', () => {
    it('should explore a trace in table format', async () => {
      const trace = createTestTrace('explore-test');
      await writeFile(
        join(TEST_TRACES_DIR, 'explore-test.artrace.json'),
        JSON.stringify(trace),
        'utf-8',
      );

      await explore({ trace: 'explore-test', format: 'table' });

      expect(logs.some((l) => l.includes('Trace:'))).toBe(true);
      expect(logs.some((l) => l.includes('llm_call'))).toBe(true);
    });

    it('should explore a trace in json format', async () => {
      const trace = createTestTrace('explore-json');
      await writeFile(
        join(TEST_TRACES_DIR, 'explore-json.artrace.json'),
        JSON.stringify(trace),
        'utf-8',
      );

      await explore({ trace: 'explore-json', format: 'json' });

      expect(logs.some((l) => l.includes('"version"'))).toBe(true);
    });

    it('should explore a trace in tree format', async () => {
      const trace = createTestTrace('explore-tree');
      await writeFile(
        join(TEST_TRACES_DIR, 'explore-tree.artrace.json'),
        JSON.stringify(trace),
        'utf-8',
      );

      await explore({ trace: 'explore-tree', format: 'tree' });

      expect(logs.some((l) => l.includes('llm_call:'))).toBe(true);
    });

    it('should explore a trace with nested spans in tree format', async () => {
      const trace = {
        ...createTestTrace('explore-nested'),
        spans: [
          {
            id: 'parent-1',
            name: 'parent',
            kind: 'agent_step',
            startTime: 0,
            endTime: 100,
            status: 'ok',
            events: [],
            attributes: {},
            links: [],
          },
          {
            id: 'child-1',
            parentId: 'parent-1',
            name: 'child',
            kind: 'llm_call',
            startTime: 10,
            endTime: 90,
            status: 'ok',
            events: [],
            attributes: {},
            links: [],
          },
        ],
      };
      await writeFile(
        join(TEST_TRACES_DIR, 'explore-nested.artrace.json'),
        JSON.stringify(trace),
        'utf-8',
      );

      await explore({ trace: 'explore-nested', format: 'tree' });

      expect(logs.some((l) => l.includes('child'))).toBe(true);
    });

    it('should explore a trace with checkpoints in table format', async () => {
      const trace = {
        ...createTestTrace('explore-cp'),
        checkpoints: [
          {
            id: 'cp-1',
            spanId: 'span-1',
            timestamp: Date.now(),
            state: {
              variables: {},
              memory: { entries: [] },
              conversation: { messages: [] },
              toolRegistry: { tools: [] },
            },
            context: { sessionId: 'explore-cp', variables: {} },
            metadata: { name: 'after-llm' },
          },
        ],
      };
      await writeFile(
        join(TEST_TRACES_DIR, 'explore-cp.artrace.json'),
        JSON.stringify(trace),
        'utf-8',
      );

      await explore({ trace: 'explore-cp', format: 'table' });

      expect(logs.some((l) => l.includes('Checkpoints:'))).toBe(true);
      expect(logs.some((l) => l.includes('[CP]'))).toBe(true);
    });
  });

  describe('diff', () => {
    it('should diff two traces in human format', async () => {
      const baseline = createTestTrace('diff-base');
      const current = createTestTrace('diff-curr');
      await writeFile(
        join(TEST_TRACES_DIR, 'diff-base.artrace.json'),
        JSON.stringify(baseline),
        'utf-8',
      );
      await writeFile(
        join(TEST_TRACES_DIR, 'diff-curr.artrace.json'),
        JSON.stringify(current),
        'utf-8',
      );

      await diff({
        baseline: 'diff-base',
        current: 'diff-curr',
        format: 'human',
        similarity: '0.95',
      });

      expect(logs.some((l) => l.includes('Baseline:'))).toBe(true);
    });

    it('should diff two traces in json format', async () => {
      const baseline = createTestTrace('diff-json-base');
      const current = createTestTrace('diff-json-curr');
      await writeFile(
        join(TEST_TRACES_DIR, 'diff-json-base.artrace.json'),
        JSON.stringify(baseline),
        'utf-8',
      );
      await writeFile(
        join(TEST_TRACES_DIR, 'diff-json-curr.artrace.json'),
        JSON.stringify(current),
        'utf-8',
      );

      await diff({
        baseline: 'diff-json-base',
        current: 'diff-json-curr',
        format: 'json',
        similarity: '0.95',
      });

      expect(logs.some((l) => l.includes('"semantic"'))).toBe(true);
    });

    it('should report differences when traces diverge', async () => {
      const baseline = createTestTrace('diff-div-base');
      const current = {
        ...createTestTrace('diff-div-curr'),
        spans: [
          {
            id: 'span-1',
            name: 'llm-call',
            kind: 'llm_call',
            startTime: Date.now(),
            endTime: Date.now() + 100,
            status: 'ok',
            events: [
              {
                timestamp: Date.now() + 100,
                type: 'response',
                name: 'resp',
                attributes: {},
                data: { content: 'Different output' },
              },
            ],
            attributes: {},
            links: [],
          },
        ],
      };
      await writeFile(
        join(TEST_TRACES_DIR, 'diff-div-base.artrace.json'),
        JSON.stringify(baseline),
        'utf-8',
      );
      await writeFile(
        join(TEST_TRACES_DIR, 'diff-div-curr.artrace.json'),
        JSON.stringify(current),
        'utf-8',
      );

      await diff({
        baseline: 'diff-div-base',
        current: 'diff-div-curr',
        format: 'human',
        similarity: '0.95',
      });

      expect(logs.some((l) => l.includes('Baseline:'))).toBe(true);
    });
  });

  describe('debug', () => {
    it('should debug a trace', async () => {
      const trace = createTestTrace('debug-test');
      await writeFile(
        join(TEST_TRACES_DIR, 'debug-test.artrace.json'),
        JSON.stringify(trace),
        'utf-8',
      );

      await debug({ trace: 'debug-test', watch: [] });

      expect(logs.some((l) => l.includes('Debugging trace:'))).toBe(true);
    });

    it('should debug with breakpoint options', async () => {
      const trace = createTestTrace('debug-bp');
      await writeFile(
        join(TEST_TRACES_DIR, 'debug-bp.artrace.json'),
        JSON.stringify(trace),
        'utf-8',
      );

      await debug({
        trace: 'debug-bp',
        kind: 'llm_call',
        span: 'llm-call',
        step: '0',
        watch: ['span.name'],
        annotations: true,
      });

      expect(logs.some((l) => l.includes('Debugging trace:'))).toBe(true);
    });

    it('should debug a trace with error spans and annotations', async () => {
      const trace = {
        ...createTestTrace('debug-error'),
        spans: [
          {
            id: 'span-1',
            name: 'error-span',
            kind: 'error',
            startTime: 0,
            endTime: 100,
            status: 'error',
            events: [
              {
                timestamp: 100,
                type: 'error',
                name: 'err',
                attributes: {},
                data: { message: 'Oops' },
              },
            ],
            attributes: {},
            links: [],
          },
          {
            id: 'span-2',
            name: 'annotated-span',
            kind: 'llm_call',
            startTime: 100,
            endTime: 200,
            status: 'ok',
            events: [
              {
                timestamp: 200,
                type: 'annotation',
                name: 'ann-1',
                attributes: { author: 'tester', severity: 'warning', tags: ['bug'] },
                data: { spanId: 'span-2', content: 'Check this' },
              },
            ],
            attributes: {},
            links: [],
          },
        ],
        checkpoints: [
          {
            id: 'cp-1',
            spanId: 'span-2',
            timestamp: 200,
            state: {
              variables: { count: 1 },
              memory: { entries: [] },
              conversation: { messages: [] },
              toolRegistry: { tools: [] },
            },
            context: { sessionId: 'debug-error', variables: {} },
            metadata: { name: 'after-annotated' },
          },
        ],
      };
      await writeFile(
        join(TEST_TRACES_DIR, 'debug-error.artrace.json'),
        JSON.stringify(trace),
        'utf-8',
      );

      await debug({
        trace: 'debug-error',
        watch: ['variables.count', 'span.name'],
        annotations: true,
      });

      expect(logs.some((l) => l.includes('[ERROR]'))).toBe(true);
      expect(logs.some((l) => l.includes('Annotation by tester:'))).toBe(true);
    });
  });
});
