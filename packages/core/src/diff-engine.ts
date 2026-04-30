import type {
  DiffOptions,
  DiffResult,
  DiffStatistics,
  ReplayResult,
  Trace,
  TraceDiff,
} from '@reaatech/agent-replay-shared';

export class DiffEngine {
  compare(
    recorded: Trace | ReplayResult,
    replayed: ReplayResult,
    options: DiffOptions,
  ): DiffResult {
    const diffs: TraceDiff[] = [];
    const recordedTrace = 'trace' in recorded ? recorded.trace : recorded;

    // Structural comparison
    if (options.includeStructural !== false) {
      const structuralDiff = this.compareStructural(recordedTrace, replayed.trace);
      diffs.push(...structuralDiff);
    }

    // Semantic comparison
    if (options.includeSemantic !== false) {
      const semanticDiff = this.compareSemantic(recordedTrace, replayed);
      diffs.push(...semanticDiff);
    }

    const stats: DiffStatistics = {
      totalDifferences: diffs.length,
      semanticChanges: diffs.filter((d) => d.type.startsWith('semantic')).length,
      structuralChanges: diffs.filter((d) => d.type.startsWith('structural')).length,
    };

    return {
      diffs,
      statistics: stats,
      report: this.generateReport(diffs, stats),
      severity: this.calculateSeverity(diffs, stats),
    };
  }

  private compareStructural(recorded: Trace, replayed: Trace): TraceDiff[] {
    const diffs: TraceDiff[] = [];

    if (recorded.spans.length !== replayed.spans.length) {
      diffs.push({
        type: 'structural.span_count',
        severity: 'high',
        message: `Span count changed: ${recorded.spans.length} → ${replayed.spans.length}`,
        details: { before: recorded.spans.length, after: replayed.spans.length },
      });
    }

    const recordedErrors = recorded.spans.filter((s) => s.status === 'error').length;
    const replayedErrors = replayed.spans.filter((s) => s.status === 'error').length;
    if (recordedErrors !== replayedErrors) {
      diffs.push({
        type: 'structural.error_count',
        severity: 'critical',
        message: `Error count changed: ${recordedErrors} → ${replayedErrors}`,
        details: { before: recordedErrors, after: replayedErrors },
      });
    }

    return diffs;
  }

  private compareSemantic(recorded: Trace, replayed: ReplayResult): TraceDiff[] {
    const diffs: TraceDiff[] = [];

    // Compare LLM outputs
    const recordedOutputs = this.extractLLMOutputs(recorded);
    const replayedOutputs = replayed.outputs;

    for (let i = 0; i < Math.min(recordedOutputs.length, replayedOutputs.length); i++) {
      const before = JSON.stringify(recordedOutputs[i]);
      const after = JSON.stringify(replayedOutputs[i]);

      if (before !== after) {
        diffs.push({
          type: 'semantic.llm_output',
          severity: 'medium',
          message: `LLM output ${i + 1} changed`,
          details: { before: recordedOutputs[i], after: replayedOutputs[i] },
        });
      }
    }

    return diffs;
  }

  private extractLLMOutputs(trace: Trace): unknown[] {
    return trace.spans
      .filter((s) => s.kind === 'llm_call')
      .map((s) => s.events.find((e) => e.type === 'response')?.data)
      .filter(Boolean);
  }

  private generateReport(diffs: TraceDiff[], stats: DiffStatistics): string {
    const lines = [
      `Diff Report: ${stats.totalDifferences} differences found`,
      `  Semantic changes: ${stats.semanticChanges}`,
      `  Structural changes: ${stats.structuralChanges}`,
      '',
      ...diffs.map((d) => `[${d.severity.toUpperCase()}] ${d.message}`),
    ];
    return lines.join('\n');
  }

  private calculateSeverity(diffs: TraceDiff[], _stats: DiffStatistics): DiffResult['severity'] {
    if (diffs.some((d) => d.severity === 'critical')) return 'critical';
    if (diffs.some((d) => d.severity === 'high')) return 'high';
    if (diffs.some((d) => d.severity === 'medium')) return 'medium';
    if (diffs.some((d) => d.severity === 'low')) return 'low';
    return 'none';
  }
}
