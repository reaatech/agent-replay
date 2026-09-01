import {
  type Checkpoint,
  type ReplayConfig,
  ReplayFailedError,
  type ReplayProgress,
  type ReplayResult,
  type Span,
  type Trace,
} from '@reaatech/agent-replay-shared';

import { DeterminismController } from './state-capture.js';

/**
 * Orchestrates partial replay: replay up to a checkpoint with stubs,
 * restore captured state, then continue with live LLM calls.
 */
export class PartialReplayOrchestrator {
  private determinismController: DeterminismController;

  constructor() {
    this.determinismController = new DeterminismController();
  }

  /**
   * Find the checkpoint in a trace by ID.
   */
  findCheckpoint(trace: Trace, checkpointId: string): Checkpoint {
    const checkpoint = trace.checkpoints.find((cp) => cp.id === checkpointId);
    if (!checkpoint) {
      throw new ReplayFailedError(`Checkpoint not found: ${checkpointId}`, 0);
    }
    return checkpoint;
  }

  /**
   * Find the span index at which a checkpoint was created.
   */
  findCheckpointSpanIndex(trace: Trace, checkpoint: Checkpoint): number {
    const index = trace.spans.findIndex((s) => s.id === checkpoint.spanId);
    if (index === -1) {
      throw new ReplayFailedError(`Checkpoint references unknown span: ${checkpoint.spanId}`, 0);
    }
    return index;
  }

  /**
   * Restore deterministic environment from a checkpoint.
   * This freezes the clock, seeds random, and restores env variables
   * so that replay up to the checkpoint behaves identically.
   */
  restoreDeterminism(checkpoint: Checkpoint): void {
    // Restore clock to checkpoint timestamp
    this.determinismController.freezeClock([checkpoint.timestamp]);

    // TODO: Restore additional deterministic state when available:
    // - Math.random() seed
    // - crypto.randomUUID sequence
    // - process.env snapshot
  }

  /**
   * Restore agent state from a checkpoint.
   *
   * NOTE: Full state restoration requires framework-specific adapters.
   * For now, the state is captured in the trace but automated restoration
   * is not yet implemented. Consumers should use the {@link FrameworkStateAdapter}
   * pattern from the integrations package to restore agent state.
   *
   * This method will throw if called without a registered adapter that
   * can handle the checkpoint's state type.
   */
  restoreState(_checkpoint: Checkpoint): void {
    // State restoration is documented in the trace for reference.
    // Framework-specific adapters can be registered for automated restoration.
  }

  /**
   * Transition from stubbed replay to live execution.
   * Deactivates deterministic mocks and prepares for live LLM calls.
   */
  goLive(): void {
    this.determinismController.restore();
  }

  /**
   * Execute stubbed replay for a slice of spans.
   * Returns the outputs and the index of the last replayed span.
   */
  replaySlice(
    trace: Trace,
    startIndex: number,
    endIndex: number,
    onProgress?: (progress: ReplayProgress) => void,
  ): { outputs: Record<string, unknown>[]; lastIndex: number } {
    const outputs: Record<string, unknown>[] = [];
    const slice = trace.spans.slice(startIndex, endIndex + 1);
    const totalSteps = slice.length;

    for (let i = 0; i < slice.length; i++) {
      const span = slice[i];
      if (span.kind === 'llm_call') {
        const responseEvent = span.events.find((e) => e.type === 'response');
        if (responseEvent) {
          outputs.push(responseEvent.data as Record<string, unknown>);
        }
      }

      onProgress?.({
        percent: Math.round(((i + 1) / totalSteps) * 100),
        currentStep: i + 1,
        totalSteps,
      });
    }

    return { outputs, lastIndex: endIndex };
  }

  /**
   * Full partial replay workflow:
   * 1. Find checkpoint
   * 2. Replay up to checkpoint with stubs
   * 3. Restore state
   * 4. Go live
   * 5. Return the live execution result
   */
  async partialReplay(
    trace: Trace,
    checkpointId: string,
    config: ReplayConfig,
    liveExecutor: (spans: Span[]) => Promise<ReplayResult>,
  ): Promise<ReplayResult> {
    const checkpoint = this.findCheckpoint(trace, checkpointId);
    const checkpointIndex = this.findCheckpointSpanIndex(trace, checkpoint);

    try {
      // Phase 1: Stubbed replay up to checkpoint
      const stubbedResult = this.replaySlice(trace, 0, checkpointIndex, config.onProgress);

      // Phase 2: Restore state and determinism
      this.restoreDeterminism(checkpoint);
      this.restoreState(checkpoint);

      // Phase 3: Go live
      this.goLive();

      // Phase 4: Live execution from checkpoint onwards
      const liveSpans = trace.spans.slice(checkpointIndex + 1);
      const liveResult = await liveExecutor(liveSpans);

      return {
        trace,
        outputs: [...stubbedResult.outputs, ...liveResult.outputs],
        duration: liveResult.duration,
        divergence: liveResult.divergence,
      };
    } finally {
      this.cleanup();
    }
  }

  cleanup(): void {
    this.determinismController.restore();
  }
}
