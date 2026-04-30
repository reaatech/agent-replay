import { LocalFileStorage, PartialReplayOrchestrator } from '@reaatech/agent-replay-core';
import type { Span } from '@reaatech/agent-replay-shared';

async function main() {
  const storage = new LocalFileStorage();

  // Load a previously recorded trace
  const trace = await storage.load('./basic-trace.artrace.json');
  console.log(
    `Loaded trace with ${trace.spans.length} spans and ${trace.checkpoints.length} checkpoints`,
  );

  if (trace.checkpoints.length === 0) {
    console.log('No checkpoints found. Record a trace with checkpoints first.');
    return;
  }

  const orchestrator = new PartialReplayOrchestrator();
  const checkpointId = trace.checkpoints[0].id;

  console.log(`Replaying up to checkpoint: ${checkpointId}`);

  const result = await orchestrator.partialReplay(
    trace,
    checkpointId,
    { mode: 'partial', checkpointId },
    async (spans: Span[]) => {
      // Live execution: this is where your real agent code would run
      console.log(`Going live with ${spans.length} spans`);
      return {
        trace,
        outputs: spans.map((span, i) => ({
          content: `Live response for ${span.name} (${i})`,
        })),
        duration: 100,
      };
    },
  );

  console.log(`Partial replay complete. ${result.outputs.length} outputs produced.`);
  orchestrator.cleanup();
}

main().catch(console.error);
