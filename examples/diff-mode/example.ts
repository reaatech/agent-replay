import {
  RegressionDetector,
  SemanticDiffEngine,
  formatRegressionReport,
  formatSemanticDiff,
} from '@reaatech/agent-replay-core';
import { LocalFileStorage } from '@reaatech/agent-replay-core';

async function main() {
  const storage = new LocalFileStorage();

  // Load baseline and current traces
  const baseline = await storage.load('./baseline-trace.artrace.json');
  const current = await storage.load('./current-trace.artrace.json');

  // Semantic diff
  const diffEngine = new SemanticDiffEngine();
  const diffResult = diffEngine.compare(baseline, current);
  console.log(formatSemanticDiff(diffResult));

  // Regression detection
  const regDetector = new RegressionDetector();
  const regReport = regDetector.detect(baseline, current);
  console.log(formatRegressionReport(regReport));
}

main().catch(console.error);
