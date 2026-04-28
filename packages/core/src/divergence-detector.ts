import { type Trace, type Span, type DivergenceReport, type ReplayResult } from '@reaatech/shared';

import { textSimilarity } from './text-similarity.js';

export interface DivergenceOptions {
  /** Maximum allowed difference in span count (percentage) */
  maxSpanCountDiff?: number;
  /** Maximum allowed difference in LLM output (0-1 similarity) */
  minOutputSimilarity?: number;
  /** Whether tool call sequences must match exactly */
  strictToolCallOrder?: boolean;
  /** Whether routing decisions must match exactly */
  strictRouting?: boolean;
}

export interface DivergenceReportDetailed extends DivergenceReport {
  spanDivergences: SpanDivergence[];
  similarity: number;
}

export interface SpanDivergence {
  step: number;
  spanId: string;
  expectedKind: string;
  actualKind: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
}

/**
 * Detects when a live replay diverges from the recorded trace.
 * This is the critical feedback loop in partial replay — it tells you
 * "your code change caused different behavior starting at step N."
 */
export class DivergenceDetector {
  private options: Required<DivergenceOptions>;

  constructor(options: DivergenceOptions = {}) {
    this.options = {
      maxSpanCountDiff: options.maxSpanCountDiff ?? 20,
      minOutputSimilarity: options.minOutputSimilarity ?? 0.8,
      strictToolCallOrder: options.strictToolCallOrder ?? true,
      strictRouting: options.strictRouting ?? true,
    };
  }

  /**
   * Compare a recorded trace against a live replay result.
   * Returns detailed divergence report or null if no divergence detected.
   */
  detect(
    recorded: Trace,
    live: ReplayResult,
    options?: Partial<DivergenceOptions>
  ): DivergenceReportDetailed | null {
    const opts = { ...this.options, ...options };
    const spanDivergences: SpanDivergence[] = [];

    // Check span count
    const spanCountDiff = Math.abs(
      ((live.trace.spans.length - recorded.spans.length) / recorded.spans.length) * 100
    );
    if (spanCountDiff > opts.maxSpanCountDiff) {
      spanDivergences.push({
        step: 0,
        spanId: 'meta',
        expectedKind: 'meta',
        actualKind: 'meta',
        severity: 'high',
        details: `Span count diverged by ${spanCountDiff.toFixed(1)}% (${recorded.spans.length} → ${live.trace.spans.length})`,
      });
    }

    // Compare span-by-span
    const maxSteps = Math.max(recorded.spans.length, live.trace.spans.length);
    for (let i = 0; i < maxSteps; i++) {
      const recordedSpan = recorded.spans[i];
      const liveSpan = live.trace.spans[i];

      if (!recordedSpan || !liveSpan) {
        spanDivergences.push({
          step: i,
          spanId: recordedSpan?.id ?? liveSpan?.id ?? 'unknown',
          expectedKind: recordedSpan?.kind ?? 'missing',
          actualKind: liveSpan?.kind ?? 'missing',
          severity: 'high',
          details: `Span mismatch at step ${i}: one trace is longer than the other`,
        });
        continue;
      }

      const spanDiv = this.compareSpan(recordedSpan, liveSpan, i, opts);
      if (spanDiv) {
        spanDivergences.push(spanDiv);
      }
    }

    if (spanDivergences.length === 0) {
      return null;
    }

    // Calculate overall similarity
    const matchingSpans = maxSteps - spanDivergences.length;
    const similarity = maxSteps > 0 ? matchingSpans / maxSteps : 1;

    return {
      step: spanDivergences[0].step,
      expected: recorded,
      actual: live,
      path: `span-${spanDivergences[0].spanId}`,
      spanDivergences,
      similarity,
    };
  }

  private compareSpan(
    recorded: Span,
    live: Span,
    step: number,
    opts: Required<DivergenceOptions>
  ): SpanDivergence | null {
    // Kind mismatch
    if (recorded.kind !== live.kind) {
      return {
        step,
        spanId: recorded.id,
        expectedKind: recorded.kind,
        actualKind: live.kind,
        severity: 'critical',
        details: `Span kind changed: ${recorded.kind} → ${live.kind}`,
      };
    }

    // LLM output comparison
    if (recorded.kind === 'llm_call') {
      const recordedResponse = recorded.events.find(e => e.type === 'response')?.data as
        | { content?: string }
        | undefined;
      const liveResponse = live.events.find(e => e.type === 'response')?.data as
        | { content?: string }
        | undefined;

      const similarity = textSimilarity(
        recordedResponse?.content ?? '',
        liveResponse?.content ?? ''
      );

      if (similarity < opts.minOutputSimilarity) {
        return {
          step,
          spanId: recorded.id,
          expectedKind: recorded.kind,
          actualKind: live.kind,
          severity: similarity < 0.5 ? 'critical' : 'high',
          details: `LLM output similarity ${(similarity * 100).toFixed(1)}% below threshold ${(opts.minOutputSimilarity * 100).toFixed(0)}%`,
        };
      }
    }

    // Tool call order comparison
    if (recorded.kind === 'tool_call' && opts.strictToolCallOrder) {
      const recordedTool = recorded.events.find(e => e.type === 'request')?.data as
        | { name?: string }
        | undefined;
      const liveTool = live.events.find(e => e.type === 'request')?.data as
        | { name?: string }
        | undefined;

      if (recordedTool?.name !== liveTool?.name) {
        return {
          step,
          spanId: recorded.id,
          expectedKind: recorded.kind,
          actualKind: live.kind,
          severity: 'high',
          details: `Tool call changed: ${recordedTool?.name ?? 'none'} → ${liveTool?.name ?? 'none'}`,
        };
      }
    }

    // Routing decision comparison
    if (recorded.kind === 'routing_decision' && opts.strictRouting) {
      const recordedRoute = recorded.events.find(e => e.type === 'response')?.data;
      const liveRoute = live.events.find(e => e.type === 'response')?.data;

      if (JSON.stringify(recordedRoute) !== JSON.stringify(liveRoute)) {
        return {
          step,
          spanId: recorded.id,
          expectedKind: recorded.kind,
          actualKind: live.kind,
          severity: 'medium',
          details: `Routing decision changed`,
        };
      }
    }

    return null;
  }
}
