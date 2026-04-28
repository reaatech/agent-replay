import {
  type Trace,
  type ReplayConfig,
  type PartialReplayConfig,
  type DiffReplayConfig,
  type ReplayResult,
  ReplayFailedError,
} from '@reaatech/shared';

import { DiffEngine } from './diff-engine.js';
import { PartialReplayOrchestrator } from './partial-replay.js';

export class ReplayEngine {
  private diffEngine: DiffEngine;

  constructor() {
    this.diffEngine = new DiffEngine();
  }

  replay(trace: Trace, config: ReplayConfig): ReplayResult {
    const startTime = Date.now();

    switch (config.mode) {
      case 'stubbed':
        return this.stubbedReplay(trace, config, startTime);
      case 'live':
        return this.liveReplay(trace, config, startTime);
      case 'partial':
        return this.partialReplay(trace, config as PartialReplayConfig, startTime);
      case 'diff':
        return this.diffReplay(trace, config as DiffReplayConfig, startTime);
      default:
        throw new ReplayFailedError(`Unknown replay mode: ${String(config.mode)}`, 0);
    }
  }

  private stubbedReplay(trace: Trace, config: ReplayConfig, startTime: number): ReplayResult {
    const outputs: unknown[] = [];
    const totalSteps = trace.spans.length;

    for (let i = 0; i < totalSteps; i++) {
      const span = trace.spans[i];
      if (span.kind === 'llm_call') {
        const responseEvent = span.events.find(e => e.type === 'response');
        if (responseEvent) {
          outputs.push(responseEvent.data);
        }
      }

      config.onProgress?.({
        percent: Math.round(((i + 1) / totalSteps) * 100),
        currentStep: i + 1,
        totalSteps,
      });
    }

    return {
      trace,
      outputs,
      duration: Date.now() - startTime,
    };
  }

  private liveReplay(_trace: Trace, _config: ReplayConfig, _startTime: number): ReplayResult {
    throw new ReplayFailedError(
      'Live replay requires LLM provider interceptors to be installed. ' +
        'Use the @reaatech/interceptors package to install interceptors, or use stubbed mode for replay without live LLM calls.',
      0
    );
  }

  private partialReplay(
    trace: Trace,
    config: PartialReplayConfig,
    startTime: number
  ): ReplayResult {
    const orchestrator = new PartialReplayOrchestrator();
    const checkpoint = orchestrator.findCheckpoint(trace, config.checkpointId);
    const checkpointIndex = orchestrator.findCheckpointSpanIndex(trace, checkpoint);

    orchestrator.restoreDeterminism(checkpoint);

    const stubbedResult = orchestrator.replaySlice(trace, 0, checkpointIndex, config.onProgress);

    orchestrator.goLive();

    const liveSpans = trace.spans.slice(checkpointIndex + 1);
    const liveOutputs: unknown[] = [];
    for (let i = 0; i < liveSpans.length; i++) {
      const span = liveSpans[i];
      if (span.kind === 'llm_call') {
        const responseEvent = span.events.find(e => e.type === 'response');
        if (responseEvent) {
          liveOutputs.push(responseEvent.data);
        }
      }
    }

    orchestrator.cleanup();

    return {
      trace,
      outputs: [...stubbedResult.outputs, ...liveOutputs],
      duration: Date.now() - startTime,
    };
  }

  private diffReplay(trace: Trace, config: DiffReplayConfig, startTime: number): ReplayResult {
    // Run live replay against the recorded trace
    const liveResult = this.liveReplay(trace, config, startTime);

    // Compare live outputs against recorded trace
    const diff = this.diffEngine.compare(trace, liveResult, config.diffOptions ?? {});

    return {
      trace,
      outputs: liveResult.outputs,
      duration: Date.now() - startTime,
      divergence:
        diff.severity !== 'none'
          ? {
              step: 0,
              expected: trace,
              actual: liveResult,
              path: 'root',
            }
          : undefined,
    };
  }
}
