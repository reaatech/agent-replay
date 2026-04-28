import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  StructuredCloneStrategy,
  SnapshotterRegistry,
  FrameworkAdapterRegistry,
  DeterminismController,
} from '../state-capture.js';

describe('StructuredCloneStrategy', () => {
  const strategy = new StructuredCloneStrategy();

  it('should handle basic objects', () => {
    const state = { count: 42, name: 'test' };
    expect(strategy.canHandle(state)).toBe(true);

    const captured = strategy.capture(state);
    expect(captured.variables.count).toBe(42);
    expect(captured.variables.name).toBe('test');
  });

  it('should handle nested objects', () => {
    const state = { nested: { value: 123 } };
    const captured = strategy.capture(state);
    expect(captured.variables.nested).toEqual({ value: 123 });
  });

  it('should handle null and primitives', () => {
    expect(strategy.canHandle(null)).toBe(true);
    expect(strategy.canHandle('string')).toBe(true);
    expect(strategy.canHandle(123)).toBe(true);
    expect(strategy.canHandle(true)).toBe(true);
  });

  it('should not handle functions', () => {
    expect(strategy.canHandle(() => {})).toBe(false);
  });

  it('should throw when structuredClone fails', () => {
    expect(() => strategy.capture({ fn: () => {} })).toThrow();
  });
});

describe('SnapshotterRegistry', () => {
  let registry: SnapshotterRegistry;

  beforeEach(() => {
    registry = new SnapshotterRegistry();
  });

  it('should register and find snapshotters', () => {
    const snapshotter = {
      type: 'map',
      canHandle: (v: unknown) => v instanceof Map,
      snapshot: (v: unknown) => ({
        type: 'map',
        version: '1.0',
        data: Array.from(v as Map<unknown, unknown>),
      }),
      restore: (s: { data: unknown }) => new Map(s.data as [unknown, unknown][]),
    };

    registry.register(snapshotter);
    expect(registry.findFor(new Map())).toBe(snapshotter);
    expect(registry.findFor({})).toBeUndefined();
  });

  it('should unregister snapshotters', () => {
    const snapshotter = {
      type: 'set',
      canHandle: (v: unknown) => v instanceof Set,
      snapshot: (v: unknown) => ({
        type: 'set',
        version: '1.0',
        data: Array.from(v as Set<unknown>),
      }),
      restore: (s: { data: unknown }) => new Set(s.data as unknown[]),
    };

    registry.register(snapshotter);
    expect(registry.findFor(new Set())).toBeDefined();

    registry.unregister('set');
    expect(registry.findFor(new Set())).toBeUndefined();
  });

  it('should snapshot using registered snapshotter', () => {
    const snapshotter = {
      type: 'map',
      canHandle: (v: unknown) => v instanceof Map,
      snapshot: (v: unknown) => ({
        type: 'map',
        version: '1.0',
        data: Array.from(v as Map<unknown, unknown>),
      }),
      restore: (s: { data: unknown }) => new Map(s.data as [unknown, unknown][]),
    };

    registry.register(snapshotter);
    const map = new Map([['key', 'value']]);
    const snapshotted = registry.snapshot(map);
    expect(snapshotted.type).toBe('map');
    expect(snapshotted.data).toEqual([['key', 'value']]);
  });

  it('should fallback to structured clone for unknown types', () => {
    const snapshotted = registry.snapshot({ foo: 'bar' });
    expect(snapshotted.type).toBe('structured-clone');
  });

  it('should restore using snapshotter', () => {
    const snapshotter = {
      type: 'map',
      canHandle: (v: unknown) => v instanceof Map,
      snapshot: (v: unknown) => ({
        type: 'map',
        version: '1.0',
        data: Array.from(v as Map<unknown, unknown>),
      }),
      restore: (s: { data: unknown }) => new Map(s.data as [unknown, unknown][]),
    };

    registry.register(snapshotter);
    const restored = registry.restore({ type: 'map', version: '1.0', data: [['a', 'b']] });
    expect(restored).toBeInstanceOf(Map);
    expect((restored as Map<string, string>).get('a')).toBe('b');
  });

  it('should restore structured clone fallback', () => {
    const restored = registry.restore({ type: 'structured-clone', version: '1.0', data: { x: 1 } });
    expect(restored).toEqual({ x: 1 });
  });

  it('should throw for unknown snapshot type', () => {
    expect(() => registry.restore({ type: 'unknown', version: '1.0', data: null })).toThrow();
  });
});

describe('FrameworkAdapterRegistry', () => {
  const registry = new FrameworkAdapterRegistry();

  it('should register and find adapters', () => {
    const adapter = {
      framework: 'test',
      canHandle: (state: unknown) =>
        typeof state === 'object' && state !== null && 'test' in (state as Record<string, unknown>),
      capture: (state: unknown) => ({
        variables: state as Record<string, unknown>,
        memory: { entries: [] },
        conversation: { messages: [] },
        toolRegistry: { tools: [] },
      }),
      restore: (snapshot: { variables: Record<string, unknown> }) => snapshot.variables,
    };

    registry.register(adapter);
    expect(registry.findFor({ test: true })).toBe(adapter);
    expect(registry.findFor({ other: true })).toBeUndefined();
  });
});

describe('DeterminismController', () => {
  let controller: DeterminismController;

  beforeEach(() => {
    controller = new DeterminismController();
  });

  afterEach(() => {
    controller.restore();
  });

  it('should freeze clock', () => {
    const timestamps = [1000, 2000, 3000];
    controller.freezeClock(timestamps);

    expect(Date.now()).toBe(1000);
    expect(Date.now()).toBe(2000);
    expect(Date.now()).toBe(3000);
    // After exhausting timestamps, falls back to original Date.now
    expect(Date.now()).toBeGreaterThan(1000000);
  });

  it('should seed random', () => {
    controller.seedRandom(42);
    const val1 = Math.random();
    controller.restore();
    controller.seedRandom(42);
    const val2 = Math.random();
    expect(val1).toBe(val2);
  });

  it('should mock UUID', () => {
    const uuids = [
      'uuid-1',
      'uuid-2',
      'uuid-3',
    ] as unknown as `${string}-${string}-${string}-${string}-${string}`[];
    controller.mockUUID(uuids);

    expect(crypto.randomUUID()).toBe('uuid-1');
    expect(crypto.randomUUID()).toBe('uuid-2');
    expect(crypto.randomUUID()).toBe('uuid-3');
    expect(crypto.randomUUID()).toMatch(/mock-uuid/);
  });

  it('should restore all mocks', () => {
    const originalNow = Date.now;
    controller.freezeClock([1000]);
    expect(Date.now).not.toBe(originalNow);

    controller.restore();
    expect(Date.now).toBe(originalNow);
  });

  it('should be safe to restore multiple times', () => {
    controller.freezeClock([1000]);
    controller.restore();
    controller.restore();
    expect(Date.now()).toBeGreaterThan(1000000);
  });

  it('should be safe to restore when nothing was mocked', () => {
    expect(() => controller.restore()).not.toThrow();
  });
});
