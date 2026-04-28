import { randomUUID } from 'node:crypto';

import { type SerializedState, StateCaptureError } from '@reaatech/shared';

/**
 * Attempts to serialize agent state using structured clone.
 * Falls back to JSON serialization for simple objects.
 */
export class StructuredCloneStrategy {
  canHandle(state: unknown): boolean {
    if (state === null || state === undefined) return true;
    const type = typeof state;
    return type === 'object' || type === 'string' || type === 'number' || type === 'boolean';
  }

  capture(state: unknown): SerializedState {
    try {
      const cloned = structuredClone(state) as Record<string, unknown>;
      return {
        variables: cloned,
        memory: { entries: [] },
        conversation: { messages: [] },
        toolRegistry: { tools: [] },
      };
    } catch (cause) {
      throw new StateCaptureError(
        'Failed to capture state with structured clone',
        typeof state === 'object' ? (state?.constructor?.name ?? 'unknown') : typeof state,
        cause instanceof Error ? cause : undefined
      );
    }
  }
}

/**
 * Registry for custom snapshotters that handle non-serializable objects.
 * Frameworks can register snapshotters for their specific state types.
 */
export interface Snapshotter<T = unknown> {
  type: string;
  canHandle(value: unknown): boolean;
  snapshot(value: T): SnapshottedValue;
  restore(snapshot: SnapshottedValue): T;
}

export interface SnapshottedValue {
  type: string;
  version: string;
  data: unknown;
}

export class SnapshotterRegistry {
  private snapshotters = new Map<string, Snapshotter>();

  register(snapshotter: Snapshotter): void {
    this.snapshotters.set(snapshotter.type, snapshotter);
  }

  unregister(type: string): void {
    this.snapshotters.delete(type);
  }

  findFor(value: unknown): Snapshotter | undefined {
    for (const snapshotter of this.snapshotters.values()) {
      if (snapshotter.canHandle(value)) {
        return snapshotter;
      }
    }
    return undefined;
  }

  snapshot(value: unknown): SnapshottedValue {
    const snapshotter = this.findFor(value);
    if (snapshotter) {
      return snapshotter.snapshot(value);
    }

    // Fallback: structured clone
    return {
      type: 'structured-clone',
      version: '1.0',
      data: value,
    };
  }

  restore(sv: SnapshottedValue): unknown {
    const snapshotter = this.snapshotters.get(sv.type);
    if (snapshotter) {
      return snapshotter.restore(sv);
    }

    if (sv.type === 'structured-clone') {
      return sv.data;
    }

    throw new StateCaptureError(`No snapshotter registered for type: ${sv.type}`, sv.type);
  }
}

/**
 * Framework-specific adapter for capturing and restoring state.
 * Each supported framework (LangChain, LangGraph, etc.) provides an adapter.
 */
export interface FrameworkStateAdapter {
  readonly framework: string;
  canHandle(state: unknown): boolean;
  capture(state: unknown): SerializedState;
  restore(snapshot: SerializedState): unknown;
}

export class FrameworkAdapterRegistry {
  private adapters = new Map<string, FrameworkStateAdapter>();

  register(adapter: FrameworkStateAdapter): void {
    this.adapters.set(adapter.framework, adapter);
  }

  findFor(state: unknown): FrameworkStateAdapter | undefined {
    for (const adapter of this.adapters.values()) {
      if (adapter.canHandle(state)) {
        return adapter;
      }
    }
    return undefined;
  }
}

/**
 * Deterministic replay primitives to control non-deterministic sources.
 */
export class DeterminismController {
  private originalDateNow: (() => number) | null = null;
  private originalRandom: (() => number) | null = null;
  private originalUUID: (() => string) | null = null;

  get isActive(): boolean {
    return (
      this.originalDateNow !== null || this.originalRandom !== null || this.originalUUID !== null
    );
  }

  /**
   * Freeze Date.now() to return recorded timestamps.
   */
  freezeClock(recordedTimestamps: number[]): void {
    let index = 0;
    this.originalDateNow = Date.now;
    Date.now = () => recordedTimestamps[index++] ?? this.originalDateNow!();
  }

  /**
   * Seed Math.random() for deterministic replay.
   */
  seedRandom(seed: number): void {
    if (!this.originalRandom) {
      this.originalRandom = Math.random;
    }
    // Simple LCG for deterministic pseudo-random numbers
    let s = seed;
    Math.random = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  /**
   * Replace crypto.randomUUID with a deterministic generator.
   */
  mockUUID(sequence: string[]): void {
    let index = 0;
    this.originalUUID = randomUUID;
    crypto.randomUUID = (() => {
      const value = sequence[index++];
      return value
        ? (value as `${string}-${string}-${string}-${string}-${string}`)
        : `mock-uuid-${index}`;
    }) as typeof crypto.randomUUID;
  }

  /**
   * Restore all mocked globals.
   */
  restore(): void {
    if (this.originalDateNow) {
      Date.now = this.originalDateNow;
      this.originalDateNow = null;
    }
    if (this.originalRandom) {
      Math.random = this.originalRandom;
      this.originalRandom = null;
    }
    if (this.originalUUID) {
      crypto.randomUUID = this.originalUUID as typeof crypto.randomUUID;
      this.originalUUID = null;
    }
  }
}
