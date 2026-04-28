import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { LocalFileStorage } from '../trace-storage.js';

describe('LocalFileStorage', () => {
  let testDir: string;
  let storage: LocalFileStorage;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'agent-replay-storage-test-'));
    storage = new LocalFileStorage(testDir);
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should save and load a trace', async () => {
    const trace = {
      version: '1.0.0',
      metadata: {
        id: 'test-trace',
        name: 'Test',
        createdAt: Date.now(),
        agentVersion: '1.0.0',
        environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
        tags: [],
        summary: { id: 'test', name: 'test', spanCount: 0, duration: 0 },
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

    await storage.save(trace);
    const loaded = await storage.load('test-trace');
    expect(loaded.metadata.id).toBe('test-trace');
  });

  it('should save with compression', async () => {
    const trace = {
      version: '1.0.0',
      metadata: {
        id: 'compressed-trace',
        name: 'Test',
        createdAt: Date.now(),
        agentVersion: '1.0.0',
        environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
        tags: [],
        summary: { id: 'test', name: 'test', spanCount: 0, duration: 0 },
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

    await storage.save(trace, { compress: true });
    const loaded = await storage.load('compressed-trace', { compress: true });
    expect(loaded.metadata.id).toBe('compressed-trace');
  });

  it('should throw when loading non-existent trace', async () => {
    await expect(storage.load('non-existent')).rejects.toThrow();
  });

  it('should delete a trace', async () => {
    const trace = {
      version: '1.0.0',
      metadata: {
        id: 'delete-me',
        name: 'Test',
        createdAt: Date.now(),
        agentVersion: '1.0.0',
        environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
        tags: [],
        summary: { id: 'test', name: 'test', spanCount: 0, duration: 0 },
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

    await storage.save(trace);
    await storage.delete('delete-me');
    await expect(storage.load('delete-me')).rejects.toThrow();
  });

  it('should throw when deleting non-existent trace', async () => {
    await expect(storage.delete('non-existent')).rejects.toThrow();
  });

  it('should return empty list when directory is empty', async () => {
    const list = await storage.list();
    expect(list).toHaveLength(0);
  });

  it('should list saved traces', async () => {
    const trace = {
      version: '1.0.0',
      metadata: {
        id: 'list-me',
        name: 'List Test',
        createdAt: Date.now(),
        agentVersion: '1.0.0',
        environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
        tags: [],
        summary: { id: 'test', name: 'test', spanCount: 1, duration: 100 },
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

    await storage.save(trace);
    const list = await storage.list();
    expect(list.length).toBeGreaterThan(0);
  });

  it('should filter list by tags', async () => {
    const trace = {
      version: '1.0.0',
      metadata: {
        id: 'filter-me',
        name: 'Filter Test',
        createdAt: Date.now(),
        agentVersion: '1.0.0',
        environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
        tags: ['test'],
        summary: { id: 'test', name: 'test', spanCount: 1, duration: 100 },
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

    await storage.save(trace);
    const list = await storage.list({ tags: ['test'] });
    expect(list.length).toBeGreaterThan(0);

    const noMatch = await storage.list({ tags: ['nonexistent'] });
    expect(noMatch).toHaveLength(0);
  });

  it('should filter list by date range', async () => {
    const now = Date.now();
    const trace = {
      version: '1.0.0',
      metadata: {
        id: 'date-me',
        name: 'Date Test',
        createdAt: now,
        agentVersion: '1.0.0',
        environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
        tags: [],
        summary: { id: 'test', name: 'test', spanCount: 1, duration: 100 },
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

    await storage.save(trace);
    const withinRange = await storage.list({ startDate: now - 1000, endDate: now + 1000 });
    expect(withinRange.length).toBeGreaterThan(0);

    const outsideRange = await storage.list({ startDate: now + 1000, endDate: now + 2000 });
    expect(outsideRange).toHaveLength(0);
  });

  it('should search traces by text', async () => {
    const trace = {
      version: '1.0.0',
      metadata: {
        id: 'search-me',
        name: 'Search Test',
        createdAt: Date.now(),
        agentVersion: '1.0.0',
        environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
        tags: ['searchable'],
        summary: { id: 'test', name: 'test', spanCount: 1, duration: 100 },
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

    await storage.save(trace);
    const results = await storage.search({ text: 'Search' });
    expect(results.total).toBeGreaterThan(0);
    expect(results.results.length).toBeGreaterThan(0);
  });

  it('should return empty search results for non-matching query', async () => {
    const results = await storage.search({ text: 'nonexistent-xyz-123' });
    expect(results.total).toBe(0);
    expect(results.results).toHaveLength(0);
  });

  it('should paginate search results', async () => {
    const trace = {
      version: '1.0.0',
      metadata: {
        id: 'page-me',
        name: 'Page Test',
        createdAt: Date.now(),
        agentVersion: '1.0.0',
        environment: { node: '20.0.0', platform: 'darwin', arch: 'arm64' },
        tags: [],
        summary: { id: 'test', name: 'test', spanCount: 1, duration: 100 },
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

    await storage.save(trace);
    const results = await storage.search({ text: 'Page', limit: 1, offset: 0 });
    expect(results.results.length).toBeLessThanOrEqual(1);
  });

  it('should skip invalid files in list', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(testDir, 'invalid.artrace.json'), 'not json', 'utf-8');
    const list = await storage.list();
    expect(list).toHaveLength(0);
  });
});
