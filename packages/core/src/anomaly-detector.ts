import type { Trace } from '@reaatech/shared';

export interface Anomaly {
  type: 'duration_spike' | 'error_burst' | 'pattern_break' | 'token_spike' | 'loop_detected';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  step: number;
  spanId?: string;
  metric: { name: string; value: number; threshold: number };
}

export interface AnomalyReport {
  traceId: string;
  anomalies: Anomaly[];
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  summary: string;
}

/**
 * Detects anomalies in agent traces that may indicate problems
 * such as performance degradation, error bursts, or unusual patterns.
 */
export class AnomalyDetector {
  private thresholds: {
    durationSpikeMs: number;
    errorBurstWindow: number;
    errorBurstThreshold: number;
    tokenSpikeMultiplier: number;
    loopDetectionWindow: number;
  };

  constructor(thresholds?: Partial<AnomalyDetector['thresholds']>) {
    this.thresholds = {
      durationSpikeMs: thresholds?.durationSpikeMs ?? 5000,
      errorBurstWindow: thresholds?.errorBurstWindow ?? 5,
      errorBurstThreshold: thresholds?.errorBurstThreshold ?? 2,
      tokenSpikeMultiplier: thresholds?.tokenSpikeMultiplier ?? 3,
      loopDetectionWindow: thresholds?.loopDetectionWindow ?? 10,
    };
  }

  /**
   * Analyze a trace and detect anomalies.
   */
  detect(trace: Trace): AnomalyReport {
    const anomalies: Anomaly[] = [
      ...this.detectDurationSpikes(trace),
      ...this.detectErrorBursts(trace),
      ...this.detectPatternBreaks(trace),
      ...this.detectTokenSpikes(trace),
      ...this.detectLoops(trace),
    ];

    const severity = this.computeOverallSeverity(anomalies);

    return {
      traceId: trace.metadata.id,
      anomalies,
      severity,
      summary: this.generateSummary(anomalies, severity),
    };
  }

  private detectDurationSpikes(trace: Trace): Anomaly[] {
    const anomalies: Anomaly[] = [];

    for (let i = 0; i < trace.spans.length; i++) {
      const span = trace.spans[i];
      const duration = (span.endTime ?? span.startTime) - span.startTime;

      if (duration > this.thresholds.durationSpikeMs) {
        anomalies.push({
          type: 'duration_spike',
          severity: duration > this.thresholds.durationSpikeMs * 2 ? 'high' : 'medium',
          message: `Span "${span.name}" took ${duration}ms (threshold: ${this.thresholds.durationSpikeMs}ms)`,
          step: i,
          spanId: span.id,
          metric: { name: 'duration', value: duration, threshold: this.thresholds.durationSpikeMs },
        });
      }
    }

    return anomalies;
  }

  private detectErrorBursts(trace: Trace): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const window = this.thresholds.errorBurstWindow;
    const threshold = this.thresholds.errorBurstThreshold;

    for (let i = 0; i <= trace.spans.length - window; i++) {
      const windowSpans = trace.spans.slice(i, i + window);
      const errors = windowSpans.filter(s => s.status === 'error').length;

      if (errors >= threshold) {
        anomalies.push({
          type: 'error_burst',
          severity: errors >= threshold * 2 ? 'critical' : 'high',
          message: `${errors} errors in ${window} consecutive spans (steps ${i}-${i + window - 1})`,
          step: i,
          metric: { name: 'error_count', value: errors, threshold },
        });
        // Skip ahead to avoid duplicate reports
        i += window - 1;
      }
    }

    return anomalies;
  }

  private detectPatternBreaks(trace: Trace): Anomaly[] {
    const anomalies: Anomaly[] = [];
    if (trace.spans.length < 3) return anomalies;

    // Detect unexpected kind transitions (e.g., tool_call -> llm_call is normal,
    // but error -> llm_call without recovery might be notable)
    for (let i = 1; i < trace.spans.length; i++) {
      const prev = trace.spans[i - 1];
      const curr = trace.spans[i];

      if (prev.status === 'error' && curr.kind !== 'error') {
        anomalies.push({
          type: 'pattern_break',
          severity: 'medium',
          message: `Recovery after error at step ${i - 1}: ${curr.kind} followed error`,
          step: i,
          spanId: curr.id,
          metric: { name: 'recovery_step', value: i, threshold: 0 },
        });
      }
    }

    return anomalies;
  }

  private detectTokenSpikes(trace: Trace): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const tokenCounts: Array<{ step: number; tokens: number }> = [];

    for (let i = 0; i < trace.spans.length; i++) {
      const span = trace.spans[i];
      if (span.kind !== 'llm_call') continue;

      const resp = span.events.find(e => e.type === 'response');
      const data = resp?.data as { usage?: { total?: number } } | undefined;
      const tokens = data?.usage?.total ?? 0;

      if (tokens > 0) {
        tokenCounts.push({ step: i, tokens });
      }
    }

    if (tokenCounts.length < 2) return anomalies;

    const mean = tokenCounts.reduce((s, t) => s + t.tokens, 0) / tokenCounts.length;
    const threshold = mean * this.thresholds.tokenSpikeMultiplier;

    for (const { step, tokens } of tokenCounts) {
      if (tokens > threshold) {
        anomalies.push({
          type: 'token_spike',
          severity: tokens > threshold * 2 ? 'high' : 'medium',
          message: `Token usage spike at step ${step}: ${tokens} tokens (avg: ${Math.round(mean)})`,
          step,
          metric: { name: 'token_count', value: tokens, threshold: Math.round(threshold) },
        });
      }
    }

    return anomalies;
  }

  private detectLoops(trace: Trace): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const window = this.thresholds.loopDetectionWindow;

    if (trace.spans.length < window * 2) return anomalies;

    // Look for repeated patterns of span kinds
    for (let i = 0; i <= trace.spans.length - window * 2; i++) {
      const pattern1 = trace.spans
        .slice(i, i + window)
        .map(s => s.kind)
        .join(',');
      const pattern2 = trace.spans
        .slice(i + window, i + window * 2)
        .map(s => s.kind)
        .join(',');

      if (pattern1 === pattern2 && pattern1.split(',').length > 1) {
        anomalies.push({
          type: 'loop_detected',
          severity: 'high',
          message: `Potential loop detected: repeating pattern of ${window} spans starting at step ${i}`,
          step: i,
          metric: { name: 'loop_length', value: window, threshold: window },
        });
        // Skip ahead
        i += window * 2 - 1;
      }
    }

    return anomalies;
  }

  private computeOverallSeverity(anomalies: Anomaly[]): AnomalyReport['severity'] {
    if (anomalies.length === 0) return 'none';
    if (anomalies.some(a => a.severity === 'critical')) return 'critical';
    if (anomalies.some(a => a.severity === 'high')) return 'high';
    if (anomalies.some(a => a.severity === 'medium')) return 'medium';
    return 'low';
  }

  private generateSummary(anomalies: Anomaly[], severity: AnomalyReport['severity']): string {
    if (anomalies.length === 0) return 'No anomalies detected.';

    const byType = new Map<string, number>();
    for (const a of anomalies) {
      byType.set(a.type, (byType.get(a.type) ?? 0) + 1);
    }

    const parts = [`Detected ${anomalies.length} anomaly(ies) with ${severity} severity:`];
    for (const [type, count] of byType) {
      parts.push(`  ${count}x ${type}`);
    }

    return parts.join('\n');
  }
}

/**
 * Format an anomaly report into a human-readable string.
 */
export function formatAnomalyReport(report: AnomalyReport): string {
  const lines = [
    `Anomaly Report for Trace: ${report.traceId}`,
    `  Overall Severity: ${report.severity.toUpperCase()}`,
    `  Anomalies: ${report.anomalies.length}`,
    '',
    report.summary,
    '',
  ];

  for (const anomaly of report.anomalies) {
    lines.push(`[${anomaly.severity.toUpperCase()}] ${anomaly.type}`);
    lines.push(`  Step ${anomaly.step}: ${anomaly.message}`);
    lines.push(
      `  Metric: ${anomaly.metric.name} = ${anomaly.metric.value} (threshold: ${anomaly.metric.threshold})`
    );
    lines.push('');
  }

  return lines.join('\n');
}
