import type { Trace } from '@reaatech/agent-replay-shared';

import { AnomalyDetector, formatAnomalyReport } from './anomaly-detector.js';
import { DivergenceDetector } from './divergence-detector.js';
import { formatRegressionReport, RegressionDetector } from './regression-detector.js';
import { formatSemanticDiff, SemanticDiffEngine } from './semantic-diff.js';

export interface CICDCheckConfig {
  /** Baseline trace to compare against */
  baseline: Trace;
  /** Fail if any regression is found */
  failOnRegression?: boolean;
  /** Fail if semantic similarity is below this threshold (0-1) */
  minSimilarity?: number;
  /** Fail if anomalies are detected */
  failOnAnomaly?: boolean;
  /** Fail if divergence is detected */
  failOnDivergence?: boolean;
  /** Labels for CI output formatting */
  labels?: {
    baseline?: string;
    current?: string;
  };
}

export interface CICDCheckResult {
  passed: boolean;
  regressions: ReturnType<RegressionDetector['detect']>;
  semanticDiff: ReturnType<SemanticDiffEngine['compare']>;
  anomalyReport: ReturnType<AnomalyDetector['detect']>;
  divergence: ReturnType<DivergenceDetector['detect']>;
  failures: string[];
  formattedReport: string;
}

/**
 * CI/CD helper for automated regression testing.
 *
 * Compares a current trace against a baseline and produces
 * a pass/fail result suitable for CI pipelines.
 *
 * Example usage in a GitHub Action:
 * ```typescript
 * const result = await runCICDCheck({
 *   baseline: await loadTrace('baseline.artrace.json'),
 *   minSimilarity: 0.95,
 *   failOnRegression: true,
 * });
 * if (!result.passed) {
 *   console.error(result.formattedReport);
 *   process.exit(1);
 * }
 * ```
 */
export function runCICDCheck(current: Trace, config: CICDCheckConfig): CICDCheckResult {
  const failures: string[] = [];

  // Regression detection
  const regressionDetector = new RegressionDetector();
  const regressions = regressionDetector.detect(config.baseline, current);

  if (config.failOnRegression && regressions.regressions.length > 0) {
    failures.push(`${regressions.regressions.length} regression(s) detected`);
  }

  // Semantic diff
  const diffEngine = new SemanticDiffEngine();
  const semanticDiff = diffEngine.compare(config.baseline, current);

  if (config.minSimilarity !== undefined && semanticDiff.overallSimilarity < config.minSimilarity) {
    failures.push(
      `Semantic similarity ${(semanticDiff.overallSimilarity * 100).toFixed(1)}% below threshold ${(config.minSimilarity * 100).toFixed(1)}%`,
    );
  }

  // Anomaly detection
  const anomalyDetector = new AnomalyDetector();
  const anomalyReport = anomalyDetector.detect(current);

  if (config.failOnAnomaly && anomalyReport.anomalies.length > 0) {
    failures.push(`${anomalyReport.anomalies.length} anomaly(ies) detected`);
  }

  // Divergence detection (treat current as a replay result)
  const currentOutputs = current.spans
    .filter((s) => s.kind === 'llm_call')
    .map((s) => s.events.find((e) => e.type === 'response')?.data)
    .filter(Boolean);

  const divergenceDetector = new DivergenceDetector();
  const divergence = divergenceDetector.detect(config.baseline, {
    trace: current,
    outputs: currentOutputs,
    duration: current.metadata.summary.duration,
  });

  if (config.failOnDivergence && divergence !== null) {
    failures.push(`Divergence detected at step ${divergence.step}`);
  }

  const passed = failures.length === 0;

  return {
    passed,
    regressions,
    semanticDiff,
    anomalyReport,
    divergence,
    failures,
    formattedReport: formatCICDReport(
      passed,
      regressions,
      semanticDiff,
      anomalyReport,
      divergence,
      failures,
      config.labels,
    ),
  };
}

function formatCICDReport(
  passed: boolean,
  regressions: CICDCheckResult['regressions'],
  semanticDiff: CICDCheckResult['semanticDiff'],
  anomalyReport: CICDCheckResult['anomalyReport'],
  divergence: CICDCheckResult['divergence'],
  failures: string[],
  labels?: CICDCheckConfig['labels'],
): string {
  const lines = [
    '=== Agent Replay CI/CD Report ===',
    '',
    `Result: ${passed ? '✅ PASSED' : '❌ FAILED'}`,
    `Baseline: ${labels?.baseline ?? 'baseline'}`,
    `Current:  ${labels?.current ?? 'current'}`,
    '',
  ];

  if (failures.length > 0) {
    lines.push('Failures:');
    for (const f of failures) {
      lines.push(`  ❌ ${f}`);
    }
    lines.push('');
  }

  lines.push(formatRegressionReport(regressions));
  lines.push('');
  lines.push(formatSemanticDiff(semanticDiff));
  lines.push('');
  lines.push(formatAnomalyReport(anomalyReport));

  if (divergence) {
    lines.push('');
    lines.push(`Divergence detected at step ${divergence.step}`);
    lines.push(`Path: ${divergence.path}`);
    lines.push(`Similarity: ${(divergence.similarity * 100).toFixed(1)}%`);
  }

  return lines.join('\n');
}
