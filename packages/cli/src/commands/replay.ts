import { LocalFileStorage, ReplayEngine } from '@reaatech/agent-replay-core';
import type {
  PartialReplayConfig,
  ReplayConfig,
  ReplayProgress,
} from '@reaatech/agent-replay-shared';
import { Command, Option } from 'commander';

export interface ReplayOptions {
  trace: string;
  mode: string;
  checkpoint?: string;
  progress: boolean;
}

export async function replay(options: ReplayOptions): Promise<void> {
  const storage = new LocalFileStorage();
  const engine = new ReplayEngine();

  console.log(`Loading trace: ${options.trace}`);

  try {
    const trace = await storage.load(options.trace);

    console.log(`Trace: ${trace.metadata.name} (${trace.spans.length} spans)`);
    console.log(`Mode: ${options.mode}`);

    const validModes = ['stubbed', 'live', 'partial', 'diff'] as const;
    if (!validModes.includes(options.mode as (typeof validModes)[number])) {
      console.error(
        `Error: Invalid mode "${options.mode}". Must be one of: ${validModes.join(', ')}`,
      );
      process.exit(1);
    }

    const config: ReplayConfig = {
      mode: options.mode as ReplayConfig['mode'],
    };

    if (options.mode === 'partial') {
      if (!options.checkpoint) {
        console.error('Error: --checkpoint is required for partial replay');
        process.exit(1);
      }
      (config as PartialReplayConfig).checkpointId = options.checkpoint;
    }

    if (options.progress) {
      config.onProgress = (p: ReplayProgress) => {
        process.stdout.write(`\rProgress: ${p.percent}% (${p.currentStep}/${p.totalSteps})`);
      };
    }

    const result = engine.replay(trace, config);

    if (options.progress) {
      process.stdout.write('\n');
    }

    console.log(`Replay complete in ${result.duration}ms`);
    console.log(`Outputs: ${result.outputs.length}`);

    if (result.divergence) {
      console.log('Divergence detected:', result.divergence);
    }
  } catch (err: unknown) {
    console.error(
      `Failed to load trace "${options.trace}":`,
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}

export const replayCommand = new Command('replay')
  .description('Replay a recorded trace')
  .requiredOption('-t, --trace <path>', 'Path to the trace file')
  .addOption(
    new Option('-m, --mode <mode>', 'Replay mode')
      .choices(['stubbed', 'live', 'partial', 'diff'])
      .default('stubbed'),
  )
  .option('-c, --checkpoint <id>', 'Checkpoint ID for partial replay')
  .option('--progress', 'Show progress', false)
  .action(replay);
