import type { Trace } from '@reaatech/agent-replay-shared';

export interface RegressionThresholds {
  /** Error rate increase that triggers regression (0-1) */
  errorRateIncrease: number;
  /** Duration increase percentage that triggers regression */
  durationIncreasePercent: number;
  /** LLM call count change percentage that triggers regression */
  llmCallChangePercent: number;
  /** Minimum output similarity (0-1), below which is a regression */
  minOutputSimilarity: number;
  /** Tool call sequence must match exactly */
  strictToolCallOrder: boolean;
}

export interface RegressionReport {
  baseline: string;
  current: string;
  regressions: Regression[];
  overallSeverity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  summary: string;
}

export interface Regression {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  metric: {
    name: string;
    before: number;
    after: number;
    change: number;
  };
}

const DEFAULT_THRESHOLDS: RegressionThresholds = {
  errorRateIncrease: 0.05,
  durationIncreasePercent: 20,
  llmCallChangePercent: 20,
  minOutputSimilarity: 0.8,
  strictToolCallOrder: true,
};

/**
 * Detects regressions by comparing a baseline trace against a current trace.
 * Uses configurable thresholds to determine what constitutes a regression.
 */
export class RegressionDetector {
  private thresholds: RegressionThresholds;

  constructor(thresholds: Partial<RegressionThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  detect(baseline: Trace, current: Trace): RegressionReport {
    const regressions: Regression[] = [];

    regressions.push(...this.detectErrorRegression(baseline, current));
    regressions.push(...this.detectDurationRegression(baseline, current));
    regressions.push(...this.detectLLMCallRegression(baseline, current));
    regressions.push(...this.detectToolCallRegression(baseline, current));

    const severities = regressions.map((r) => r.severity);
    const overallSeverity = severities.includes('critical')
      ? 'critical'
      : severities.includes('high')
        ? 'high'
        : severities.includes('medium')
          ? 'medium'
          : severities.includes('low')
            ? 'low'
            : 'none';

    return {
      baseline: baseline.metadata.id,
      current: current.metadata.id,
      regressions,
      overallSeverity,
      summary: this.generateSummary(regressions),
    };
  }

  private detectErrorRegression(baseline: Trace, current: Trace): Regression[] {
    const baselineErrors = baseline.spans.filter((s) => s.status === 'error').length;
    const currentErrors = current.spans.filter((s) => s.status === 'error').length;
    const baselineRate = baseline.spans.length > 0 ? baselineErrors / baseline.spans.length : 0;
    const currentRate = current.spans.length > 0 ? currentErrors / current.spans.length : 0;
    const increase = currentRate - baselineRate;

    if (increase > this.thresholds.errorRateIncrease) {
      return [
        {
          type: 'error_rate_increase',
          severity: 'critical',
          message: `Error rate increased by ${(increase * 100).toFixed(1)}% (${baselineErrors} → ${currentErrors} errors)`,
          metric: {
            name: 'error_rate',
            before: baselineRate,
            after: currentRate,
            change: increase,
          },
        },
      ];
    }

    if (currentErrors > baselineErrors) {
      return [
        {
          type: 'error_rate_increase',
          severity: 'high',
          message: `New errors detected: ${baselineErrors} → ${currentErrors}`,
          metric: {
            name: 'error_count',
            before: baselineErrors,
            after: currentErrors,
            change: currentErrors - baselineErrors,
          },
        },
      ];
    }

    return [];
  }

  private detectDurationRegression(baseline: Trace, current: Trace): Regression[] {
    const baselineDuration = baseline.metadata.summary.duration;
    const currentDuration = current.metadata.summary.duration;

    if (baselineDuration <= 0) return [];

    const increase = ((currentDuration - baselineDuration) / baselineDuration) * 100;

    if (increase > this.thresholds.durationIncreasePercent) {
      return [
        {
          type: 'duration_increase',
          severity: increase > 50 ? 'high' : 'medium',
          message: `Duration increased by ${increase.toFixed(1)}% (${baselineDuration}ms → ${currentDuration}ms)`,
          metric: {
            name: 'duration',
            before: baselineDuration,
            after: currentDuration,
            change: increase,
          },
        },
      ];
    }

    return [];
  }

  private detectLLMCallRegression(baseline: Trace, current: Trace): Regression[] {
    const baselineCalls = baseline.spans.filter((s) => s.kind === 'llm_call').length;
    const currentCalls = current.spans.filter((s) => s.kind === 'llm_call').length;

    if (baselineCalls <= 0) return [];

    const increase = ((currentCalls - baselineCalls) / baselineCalls) * 100;

    if (increase > this.thresholds.llmCallChangePercent) {
      return [
        {
          type: 'llm_call_count_change',
          severity: 'medium',
          message: `LLM call count changed by ${increase.toFixed(1)}% (${baselineCalls} → ${currentCalls})`,
          metric: {
            name: 'llm_call_count',
            before: baselineCalls,
            after: currentCalls,
            change: increase,
          },
        },
      ];
    }

    return [];
  }

  private detectToolCallRegression(baseline: Trace, current: Trace): Regression[] {
    if (!this.thresholds.strictToolCallOrder) return [];

    const baselineTools = baseline.spans
      .filter((s) => s.kind === 'tool_call')
      .map((s) => s.events.find((e) => e.type === 'request')?.data as { name?: string } | undefined)
      .map((d) => d?.name ?? 'unknown');

    const currentTools = current.spans
      .filter((s) => s.kind === 'tool_call')
      .map((s) => s.events.find((e) => e.type === 'request')?.data as { name?: string } | undefined)
      .map((d) => d?.name ?? 'unknown');

    if (JSON.stringify(baselineTools) !== JSON.stringify(currentTools)) {
      return [
        {
          type: 'tool_call_sequence_change',
          severity: 'high',
          message: 'Tool call sequence changed',
          metric: {
            name: 'tool_call_sequence',
            before: baselineTools.length,
            after: currentTools.length,
            change: currentTools.length - baselineTools.length,
          },
        },
      ];
    }

    return [];
  }

  private generateSummary(regressions: Regression[]): string {
    if (regressions.length === 0) {
      return 'No regressions detected.';
    }

    const bySeverity = {
      critical: regressions.filter((r) => r.severity === 'critical').length,
      high: regressions.filter((r) => r.severity === 'high').length,
      medium: regressions.filter((r) => r.severity === 'medium').length,
      low: regressions.filter((r) => r.severity === 'low').length,
    };

    const parts: string[] = [];
    if (bySeverity.critical > 0) parts.push(`${bySeverity.critical} critical`);
    if (bySeverity.high > 0) parts.push(`${bySeverity.high} high`);
    if (bySeverity.medium > 0) parts.push(`${bySeverity.medium} medium`);
    if (bySeverity.low > 0) parts.push(`${bySeverity.low} low`);

    return `Detected ${regressions.length} regression(s): ${parts.join(', ')}.`;
  }
}

/**
 * Format a regression report for CLI display.
 */
export function formatRegressionReport(report: RegressionReport): string {
  const lines = [
    'Regression Report',
    `  Baseline: ${report.baseline}`,
    `  Current:  ${report.current}`,
    `  Severity: ${report.overallSeverity}`,
    `  ${report.summary}`,
    '',
  ];

  for (const reg of report.regressions) {
    lines.push(
      `[${reg.severity.toUpperCase()}] ${reg.type}`,
      `  ${reg.message}`,
      `  ${reg.metric.name}: ${reg.metric.before} → ${reg.metric.after} (change: ${reg.metric.change < 10 ? reg.metric.change.toFixed(2) : String(reg.metric.change)})`,
      '',
    );
  }

  return lines.join('\n');
}
