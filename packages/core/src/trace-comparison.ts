import type { Span, Trace } from '@reaatech/agent-replay-shared';

export interface TraceComparisonResult {
  /** Number of traces compared */
  traceCount: number;
  /** Common spans found across all traces */
  commonSpans: Span[];
  /** Spans unique to each trace */
  uniqueSpans: Map<string, Span[]>;
  /** Statistical comparison of durations */
  durationStats: DurationStats;
  /** Error rate across traces */
  errorRates: Map<string, number>;
  /** Span kind distribution across traces */
  kindDistribution: Map<string, Map<string, number>>;
}

export interface DurationStats {
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
}

/**
 * Compare multiple traces to identify commonalities, differences,
 * and statistical trends across runs.
 */
export class TraceComparator {
  /**
   * Compare multiple traces and produce a comprehensive comparison report.
   */
  compare(traces: Trace[]): TraceComparisonResult {
    if (traces.length === 0) {
      return {
        traceCount: 0,
        commonSpans: [],
        uniqueSpans: new Map(),
        durationStats: { mean: 0, median: 0, min: 0, max: 0, stdDev: 0 },
        errorRates: new Map(),
        kindDistribution: new Map(),
      };
    }

    const commonSpans = this.findCommonSpans(traces);
    const uniqueSpans = this.findUniqueSpans(traces);
    const durationStats = this.computeDurationStats(traces);
    const errorRates = this.computeErrorRates(traces);
    const kindDistribution = this.computeKindDistribution(traces);

    return {
      traceCount: traces.length,
      commonSpans,
      uniqueSpans,
      durationStats,
      errorRates,
      kindDistribution,
    };
  }

  /** Find spans that appear in all traces (by name + kind). */
  private findCommonSpans(traces: Trace[]): Span[] {
    if (traces.length === 0) return [];

    const spanSignatures = traces.map(
      (trace) => new Set(trace.spans.map((s) => `${s.name}:${s.kind}`)),
    );

    const common = new Set(spanSignatures[0]);
    for (let i = 1; i < spanSignatures.length; i++) {
      for (const sig of common) {
        if (!spanSignatures[i].has(sig)) {
          common.delete(sig);
        }
      }
    }

    // Return representative spans from the first trace
    return traces[0].spans.filter((s) => common.has(`${s.name}:${s.kind}`));
  }

  /** Find spans unique to each trace. */
  private findUniqueSpans(traces: Trace[]): Map<string, Span[]> {
    const result = new Map<string, Span[]>();
    const allSignatures = new Map<string, Set<number>>();

    for (let i = 0; i < traces.length; i++) {
      for (const span of traces[i].spans) {
        const sig = `${span.name}:${span.kind}`;
        if (!allSignatures.has(sig)) {
          allSignatures.set(sig, new Set());
        }
        allSignatures.get(sig)?.add(i);
      }
    }

    for (let i = 0; i < traces.length; i++) {
      const unique = traces[i].spans.filter(
        (s) => allSignatures.get(`${s.name}:${s.kind}`)?.size === 1,
      );
      result.set(traces[i].metadata.id, unique);
    }

    return result;
  }

  /** Compute duration statistics across traces. */
  private computeDurationStats(traces: Trace[]): DurationStats {
    const durations = traces.map((t) => t.metadata.summary.duration);
    const sorted = [...durations].sort((a, b) => a - b);
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const median =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const variance = durations.reduce((sum, d) => sum + (d - mean) ** 2, 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    return { mean, median, min, max, stdDev };
  }

  /** Compute error rate for each trace. */
  private computeErrorRates(traces: Trace[]): Map<string, number> {
    const result = new Map<string, number>();
    for (const trace of traces) {
      const errors = trace.spans.filter((s) => s.status === 'error').length;
      const rate = trace.spans.length > 0 ? errors / trace.spans.length : 0;
      result.set(trace.metadata.id, rate);
    }
    return result;
  }

  /** Compute span kind distribution for each trace. */
  private computeKindDistribution(traces: Trace[]): Map<string, Map<string, number>> {
    const result = new Map<string, Map<string, number>>();
    for (const trace of traces) {
      const dist = new Map<string, number>();
      for (const span of trace.spans) {
        dist.set(span.kind, (dist.get(span.kind) ?? 0) + 1);
      }
      result.set(trace.metadata.id, dist);
    }
    return result;
  }
}

/**
 * Format a trace comparison result into a human-readable report.
 */
export function formatComparison(result: TraceComparisonResult): string {
  const lines = [
    'Trace Comparison Report',
    `  Traces compared: ${result.traceCount}`,
    `  Common spans: ${result.commonSpans.length}`,
    '',
    'Duration Statistics:',
    `  Mean: ${result.durationStats.mean.toFixed(0)}ms`,
    `  Median: ${result.durationStats.median.toFixed(0)}ms`,
    `  Min: ${result.durationStats.min.toFixed(0)}ms`,
    `  Max: ${result.durationStats.max.toFixed(0)}ms`,
    `  StdDev: ${result.durationStats.stdDev.toFixed(0)}ms`,
    '',
    'Error Rates:',
  ];

  for (const [traceId, rate] of result.errorRates) {
    lines.push(`  ${traceId}: ${(rate * 100).toFixed(1)}%`);
  }

  lines.push('', 'Unique Spans per Trace:');
  for (const [traceId, spans] of result.uniqueSpans) {
    lines.push(`  ${traceId}: ${spans.length} unique spans`);
  }

  return lines.join('\n');
}
