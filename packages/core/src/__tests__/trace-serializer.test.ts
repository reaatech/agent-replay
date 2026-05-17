import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Trace } from '@reaatech/agent-replay-shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrateTrace, TraceSerializer, validateTraceVersion } from '../trace-serializer.js';

function createTestTrace(): Trace {
  return {
    version: '1.0.0',
    metadata: {
      id: 'test-trace',
      name: 'Test Trace',
      createdAt: 1234567890,
      agentVersion: '1.0.0',
      environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
      tags: ['test'],
      summary: { id: 'test', name: 'test', spanCount: 2, duration: 1000 },
    },
    spans: [
      {
        id: 'span-1',
        name: 'llm-call',
        kind: 'llm_call',
        startTime: 1234567890,
        endTime: 1234567891,
        status: 'ok',
        events: [],
        attributes: {},
        links: [],
      },
      {
        id: 'span-2',
        name: 'tool-call',
        kind: 'tool_call',
        startTime: 1234567891,
        endTime: 1234567892,
        status: 'ok',
        events: [],
        attributes: {},
        links: [],
      },
    ],
    checkpoints: [
      {
        id: 'cp-0',
        spanId: 'span-1',
        timestamp: 1234567891,
        state: {
          variables: {},
          memory: { entries: [] },
          conversation: { messages: [] },
          toolRegistry: { tools: [] },
        },
        context: { sessionId: 'test-trace', variables: {} },
        metadata: { name: 'after-llm' },
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

describe('TraceSerializer', () => {
  let serializer: TraceSerializer;
  let tempDir: string;

  beforeEach(async () => {
    serializer = new TraceSerializer();
    tempDir = await mkdtemp(join(tmpdir(), 'agent-replay-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should serialize and deserialize a trace', async () => {
    const trace = createTestTrace();
    const path = join(tempDir, 'test.artrace.json');

    await serializer.serialize(trace, path);
    const deserialized = await serializer.deserialize(path);

    expect(deserialized.version).toBe('1.0.0');
    expect(deserialized.metadata.id).toBe('test-trace');
    expect(deserialized.spans).toHaveLength(2);
    expect(deserialized.checkpoints).toHaveLength(1);
    expect(deserialized.spans[0].id).toBe('span-1');
  });

  it('should serialize with compression', async () => {
    const trace = createTestTrace();
    const path = join(tempDir, 'test.artrace.json.gz');

    await serializer.serialize(trace, path, { compress: true });
    const deserialized = await serializer.deserialize(path);

    expect(deserialized.metadata.id).toBe('test-trace');
    expect(deserialized.spans).toHaveLength(2);
  });

  it('should stream deserialize a trace', async () => {
    const trace = createTestTrace();
    const path = join(tempDir, 'stream-test.artrace.json');

    await serializer.serialize(trace, path);
    const items: unknown[] = [];

    for await (const item of serializer.streamDeserialize(path)) {
      items.push(item);
    }

    // Header + 2 spans + 1 checkpoint = 4 items
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it('should stream deserialize a compressed trace', async () => {
    const trace = createTestTrace();
    const path = join(tempDir, 'stream-test.artrace.json.gz');

    await serializer.serialize(trace, path, { compress: true });
    const items: unknown[] = [];

    for await (const item of serializer.streamDeserialize(path)) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it('should throw on empty trace file', async () => {
    const path = join(tempDir, 'empty.artrace.json');
    await writeFile(path, '', 'utf-8');
    await expect(serializer.deserialize(path)).rejects.toThrow('Empty trace file');
  });

  it('should stream deserialize where last line has no newline', async () => {
    const trace = createTestTrace();
    const path = join(tempDir, 'no-final-newline.artrace.json');
    await serializer.serialize(trace, path);

    // Read file and remove trailing newline to force buffer processing
    const data = await (await import('node:fs/promises')).readFile(path, 'utf-8');
    await writeFile(path, data.trimEnd(), 'utf-8');

    const items: unknown[] = [];
    for await (const item of serializer.streamDeserialize(path)) {
      items.push(item);
    }

    expect(items.length).toBeGreaterThanOrEqual(3);
  });
});

describe('TraceMigrator', () => {
  it('should not migrate current version traces', () => {
    const trace = createTestTrace();
    const migrated = migrateTrace(trace);
    expect(migrated.version).toBe('1.0.0');
  });

  it('should add version to legacy traces', () => {
    const trace = { ...createTestTrace(), version: undefined } as unknown as Trace;
    const migrated = migrateTrace(trace);
    expect(migrated.version).toBe('1.0.0');
  });

  it('should throw on unsupported versions', () => {
    expect(() =>
      validateTraceVersion({
        version: '2.0.0',
        format: 'artrace-json-v1',
        metadata: createTestTrace().metadata,
        schema: { spanKinds: [], eventTypes: [] },
      }),
    ).toThrow('incompatible');
  });

  it('should throw on unsupported version in migrate', () => {
    const trace = { ...createTestTrace(), version: '99.0.0' };
    expect(() => migrateTrace(trace)).toThrow('Unsupported trace version');
  });
});
