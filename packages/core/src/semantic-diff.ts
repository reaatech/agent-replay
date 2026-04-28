import { type Trace, type Span } from '@reaatech/shared';

import { textSimilarity } from './text-similarity.js';

export interface SemanticDiffOptions {
  textSimilarityThreshold?: number;
  compareToolCalls?: boolean;
  compareRouting?: boolean;
  compareTiming?: boolean;
}

export interface SemanticDiffResult {
  differences: SemanticDifference[];
  overallSimilarity: number;
  maxSeverity: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface SemanticDifference {
  step: number;
  spanId: string;
  type: 'text' | 'tool_call' | 'routing' | 'timing' | 'structure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  before: unknown;
  after: unknown;
  similarity: number;
}

/**
 * Semantic diff compares the *meaning* of LLM outputs, not just exact equality.
 * Uses text similarity, tool call comparison, and routing analysis.
 */
export class SemanticDiffEngine {
  private options: Required<SemanticDiffOptions>;

  constructor(options: SemanticDiffOptions = {}) {
    this.options = {
      textSimilarityThreshold: options.textSimilarityThreshold ?? 0.95,
      compareToolCalls: options.compareToolCalls ?? true,
      compareRouting: options.compareRouting ?? true,
      compareTiming: options.compareTiming ?? false,
    };
  }

  compare(recorded: Trace, replayed: Trace): SemanticDiffResult {
    const differences: SemanticDifference[] = [];
    const maxSteps = Math.max(recorded.spans.length, replayed.spans.length);

    for (let i = 0; i < maxSteps; i++) {
      const recordedSpan = recorded.spans[i];
      const replayedSpan = replayed.spans[i];

      if (!recordedSpan || !replayedSpan) {
        differences.push({
          step: i,
          spanId: recordedSpan?.id ?? replayedSpan?.id ?? 'unknown',
          type: 'structure',
          severity: 'high',
          message: `Span count mismatch at step ${i}`,
          before: recordedSpan?.kind ?? null,
          after: replayedSpan?.kind ?? null,
          similarity: 0,
        });
        continue;
      }

      const spanDiffs = this.compareSpan(recordedSpan, replayedSpan, i);
      differences.push(...spanDiffs);
    }

    const stepSimilarities: number[] = [];
    for (let i = 0; i < maxSteps; i++) {
      const stepDiffs = differences.filter(d => d.step === i);
      if (stepDiffs.length === 0) {
        stepSimilarities.push(1);
      } else {
        stepSimilarities.push(stepDiffs.reduce((s, d) => s + d.similarity, 0) / stepDiffs.length);
      }
    }
    const overallSimilarity =
      stepSimilarities.length > 0
        ? stepSimilarities.reduce((a, b) => a + b, 0) / stepSimilarities.length
        : 1;

    const severities = differences.map(d => d.severity);
    const maxSeverity = severities.includes('critical')
      ? 'critical'
      : severities.includes('high')
        ? 'high'
        : severities.includes('medium')
          ? 'medium'
          : severities.includes('low')
            ? 'low'
            : 'none';

    return {
      differences,
      overallSimilarity,
      maxSeverity,
    };
  }

  private compareSpan(recorded: Span, replayed: Span, step: number): SemanticDifference[] {
    const diffs: SemanticDifference[] = [];

    if (recorded.kind !== replayed.kind) {
      diffs.push({
        step,
        spanId: recorded.id,
        type: 'structure',
        severity: 'critical',
        message: `Span kind changed: ${recorded.kind} → ${replayed.kind}`,
        before: recorded.kind,
        after: replayed.kind,
        similarity: 0,
      });
      return diffs;
    }

    if (recorded.kind === 'llm_call') {
      diffs.push(...this.compareLLMOutputs(recorded, replayed, step));
    }

    if (recorded.kind === 'tool_call' && this.options.compareToolCalls) {
      diffs.push(...this.compareToolCalls(recorded, replayed, step));
    }

    if (recorded.kind === 'routing_decision' && this.options.compareRouting) {
      diffs.push(...this.compareRouting(recorded, replayed, step));
    }

    if (this.options.compareTiming) {
      diffs.push(...this.compareTiming(recorded, replayed, step));
    }

    return diffs;
  }

  private compareLLMOutputs(recorded: Span, replayed: Span, step: number): SemanticDifference[] {
    const diffs: SemanticDifference[] = [];

    const recordedResponse = recorded.events.find(e => e.type === 'response')?.data as
      | { content?: string; toolCalls?: unknown[] }
      | undefined;
    const replayedResponse = replayed.events.find(e => e.type === 'response')?.data as
      | { content?: string; toolCalls?: unknown[] }
      | undefined;

    // Compare text content
    const similarity = textSimilarity(
      recordedResponse?.content ?? '',
      replayedResponse?.content ?? ''
    );

    if (similarity < this.options.textSimilarityThreshold) {
      diffs.push({
        step,
        spanId: recorded.id,
        type: 'text',
        severity: similarity < 0.8 ? 'high' : 'medium',
        message: `LLM output changed (similarity: ${(similarity * 100).toFixed(1)}%)`,
        before: recordedResponse?.content ?? '',
        after: replayedResponse?.content ?? '',
        similarity: similarity,
      });
    }

    // Compare tool calls in response
    const recordedToolCalls = recordedResponse?.toolCalls ?? [];
    const replayedToolCalls = replayedResponse?.toolCalls ?? [];
    if (JSON.stringify(recordedToolCalls) !== JSON.stringify(replayedToolCalls)) {
      diffs.push({
        step,
        spanId: recorded.id,
        type: 'tool_call',
        severity: 'high',
        message: `Tool calls in LLM response changed`,
        before: recordedToolCalls,
        after: replayedToolCalls,
        similarity: 0,
      });
    }

    return diffs;
  }

  private compareToolCalls(recorded: Span, replayed: Span, step: number): SemanticDifference[] {
    const diffs: SemanticDifference[] = [];

    const recordedRequest = recorded.events.find(e => e.type === 'request')?.data as
      | { name?: string; arguments?: Record<string, unknown> }
      | undefined;
    const replayedRequest = replayed.events.find(e => e.type === 'request')?.data as
      | { name?: string; arguments?: Record<string, unknown> }
      | undefined;

    if (recordedRequest?.name !== replayedRequest?.name) {
      diffs.push({
        step,
        spanId: recorded.id,
        type: 'tool_call',
        severity: 'high',
        message: `Tool name changed: ${recordedRequest?.name ?? 'none'} → ${replayedRequest?.name ?? 'none'}`,
        before: recordedRequest?.name ?? null,
        after: replayedRequest?.name ?? null,
        similarity: 0,
      });
    } else if (
      JSON.stringify(recordedRequest?.arguments) !== JSON.stringify(replayedRequest?.arguments)
    ) {
      diffs.push({
        step,
        spanId: recorded.id,
        type: 'tool_call',
        severity: 'medium',
        message: `Tool arguments changed for ${recordedRequest?.name}`,
        before: recordedRequest?.arguments ?? null,
        after: replayedRequest?.arguments ?? null,
        similarity: 0.5,
      });
    }

    return diffs;
  }

  private compareRouting(recorded: Span, replayed: Span, step: number): SemanticDifference[] {
    const diffs: SemanticDifference[] = [];

    const recordedDecision = recorded.events.find(e => e.type === 'response')?.data;
    const replayedDecision = replayed.events.find(e => e.type === 'response')?.data;

    if (JSON.stringify(recordedDecision) !== JSON.stringify(replayedDecision)) {
      diffs.push({
        step,
        spanId: recorded.id,
        type: 'routing',
        severity: 'medium',
        message: `Routing decision changed`,
        before: recordedDecision ?? null,
        after: replayedDecision ?? null,
        similarity: 0,
      });
    }

    return diffs;
  }

  private compareTiming(recorded: Span, replayed: Span, step: number): SemanticDifference[] {
    const diffs: SemanticDifference[] = [];

    const recordedDuration = (recorded.endTime ?? recorded.startTime) - recorded.startTime;
    const replayedDuration = (replayed.endTime ?? replayed.startTime) - replayed.startTime;

    if (recordedDuration > 0) {
      const diff = Math.abs(replayedDuration - recordedDuration) / recordedDuration;
      if (diff > 0.2) {
        // >20% timing difference
        diffs.push({
          step,
          spanId: recorded.id,
          type: 'timing',
          severity: diff > 0.5 ? 'medium' : 'low',
          message: `Timing changed by ${(diff * 100).toFixed(1)}% (${recordedDuration}ms → ${replayedDuration}ms)`,
          before: recordedDuration,
          after: replayedDuration,
          similarity: 1 - diff,
        });
      }
    }

    return diffs;
  }
}

/**
 * Format a semantic diff result into a human-readable report.
 */
export function formatSemanticDiff(result: SemanticDiffResult): string {
  const lines = [
    `Semantic Diff Report`,
    `  Overall similarity: ${(result.overallSimilarity * 100).toFixed(1)}%`,
    `  Max severity: ${result.maxSeverity}`,
    `  Differences: ${result.differences.length}`,
    '',
  ];

  for (const diff of result.differences) {
    lines.push(
      `[${diff.severity.toUpperCase()}] Step ${diff.step} (${diff.type})`,
      `  ${diff.message}`,
      `  Similarity: ${(diff.similarity * 100).toFixed(1)}%`,
      ''
    );
  }

  return lines.join('\n');
}
