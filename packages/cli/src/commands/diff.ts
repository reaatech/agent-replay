import {
  formatRegressionReport,
  formatSemanticDiff,
  LocalFileStorage,
  RegressionDetector,
  SemanticDiffEngine,
} from '@reaatech/agent-replay-core';
import { Command } from 'commander';

export interface DiffOptions {
  baseline: string;
  current: string;
  format: string;
  similarity: string;
}

export async function diff(options: DiffOptions): Promise<void> {
  const storage = new LocalFileStorage();

  console.log('Loading traces...');

  try {
    const baseline = await storage.load(options.baseline);
    const current = await storage.load(options.current);

    console.log(`Baseline: ${baseline.metadata.name} (${baseline.spans.length} spans)`);
    console.log(`Current:  ${current.metadata.name} (${current.spans.length} spans)`);
    console.log('');

    // Run semantic diff
    const similarity = Number(options.similarity);
    if (Number.isNaN(similarity) || similarity < 0 || similarity > 1) {
      console.error('Error: Similarity must be a number between 0 and 1');
      process.exit(1);
    }

    const semanticEngine = new SemanticDiffEngine({
      textSimilarityThreshold: similarity,
    });
    const semanticResult = semanticEngine.compare(baseline, current);

    // Run regression detection
    const regressionDetector = new RegressionDetector();
    const regressionReport = regressionDetector.detect(baseline, current);

    if (options.format === 'json') {
      console.log(
        JSON.stringify(
          {
            semantic: semanticResult,
            regression: regressionReport,
          },
          null,
          2,
        ),
      );
      return;
    }

    // Human-readable format
    if (semanticResult.differences.length > 0) {
      console.log(formatSemanticDiff(semanticResult));
    } else {
      console.log('No semantic differences detected.');
    }

    console.log('');

    if (regressionReport.regressions.length > 0) {
      console.log(formatRegressionReport(regressionReport));
    } else {
      console.log('No regressions detected.');
    }
  } catch (err) {
    console.error('Failed to load trace:', (err as Error).message);
    process.exit(1);
  }
}

export const diffCommand = new Command('diff')
  .description('Compare two traces and show differences')
  .requiredOption('-b, --baseline <path>', 'Path to the baseline trace')
  .requiredOption('-c, --current <path>', 'Path to the current trace')
  .option('-f, --format <format>', 'Output format (human, json)', 'human')
  .option('-s, --similarity <threshold>', 'Text similarity threshold (0-1)', '0.95')
  .action(diff);
