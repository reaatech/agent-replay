import { LocalFileStorage, RecordingEngine } from '@reaatech/agent-replay-core';
import { Command } from 'commander';

export interface RecordOptions {
  output: string;
  name: string;
  providers: string;
  state: boolean;
}

export async function record(options: RecordOptions): Promise<void> {
  const engine = new RecordingEngine();
  const storage = new LocalFileStorage(options.output);

  const providers = options.providers
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  console.log(`Starting recording: ${options.name}`);
  console.log(`Providers: ${providers.join(', ')}`);

  const session = engine.startRecording({
    name: options.name,
    providers,
    outputPath: options.output,
    captureState: options.state,
  });

  console.log(`Recording session started: ${String(session.trace.metadata.id)}`);
  console.log('Press Ctrl+C to stop recording...');

  return new Promise<void>((resolve) => {
    const stop = async () => {
      try {
        const trace = engine.stopRecording(session);
        const savedPath = await storage.save(trace);
        console.log(`\nTrace saved: ${savedPath}`);
        resolve();
        process.exit(0);
      } catch (err: unknown) {
        console.error('Failed to save trace:', err);
        process.exit(1);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    process.on('SIGINT', stop);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    process.on('SIGTERM', stop);
  });
}

export const recordCommand = new Command('record')
  .description('Record an agent interaction')
  .requiredOption('-o, --output <path>', 'Output path for the trace file')
  .option('-n, --name <name>', 'Recording name', 'unnamed')
  .option('-p, --providers <providers>', 'Comma-separated list of providers to intercept', 'openai')
  .option('--no-state', 'Disable state capture')
  .action(record);
