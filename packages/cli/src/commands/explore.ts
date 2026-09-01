import { LocalFileStorage } from '@reaatech/agent-replay-core';
import type { Checkpoint, Span } from '@reaatech/agent-replay-shared';
import { Command } from 'commander';

export interface ExploreOptions {
  trace: string;
  format: string;
}

export async function explore(options: ExploreOptions): Promise<void> {
  const storage = new LocalFileStorage();

  try {
    const trace = await storage.load(options.trace);

    console.log(`Trace: ${trace.metadata.name}`);
    console.log(`ID: ${trace.metadata.id}`);
    console.log(`Created: ${new Date(trace.metadata.createdAt).toISOString()}`);
    console.log(`Spans: ${trace.spans.length}`);
    console.log(`Checkpoints: ${trace.checkpoints.length}`);
    console.log(`Duration: ${trace.metadata.summary.duration}ms`);
    console.log('');

    if (options.format === 'json') {
      console.log(JSON.stringify(trace, null, 2));
      return;
    }

    if (options.format === 'tree') {
      printTree(trace.spans, trace.checkpoints);
      return;
    }

    // Table format (default)
    printTable(trace.spans, trace.checkpoints);
  } catch (err: unknown) {
    console.error(
      `Failed to load trace "${options.trace}":`,
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}

function printTable(spans: Span[], checkpoints: Checkpoint[]): void {
  console.log('Spans:');
  console.log('  #  Kind            Name                Status  Start      Duration');
  console.log('  -- ----            ----                ------  -----      --------');

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    const duration = span.endTime ? span.endTime - span.startTime : '-';
    const cpIndicator = checkpoints.some((cp) => cp.spanId === span.id) ? ' [CP]' : '';

    console.log(
      `  ${String(i + 1).padStart(2)} ${span.kind.padEnd(15)} ${span.name.padEnd(19)} ${span.status.padEnd(7)} ${String(span.startTime).padStart(10)} ${String(duration).padStart(8)}${cpIndicator}`,
    );
  }

  if (checkpoints.length > 0) {
    console.log('');
    console.log('Checkpoints:');
    console.log('  ID     SpanID  Timestamp');
    console.log('  ------ ------  ---------');
    for (const cp of checkpoints) {
      console.log(`  ${cp.id.padEnd(6)} ${cp.spanId.padEnd(6)}  ${cp.timestamp}`);
    }
  }
}

function printTree(spans: Span[], checkpoints: Checkpoint[]): void {
  const roots = spans.filter((s) => !s.parentId);

  for (const root of roots) {
    printSpanNode(root, spans, checkpoints, 0);
  }
}

function printSpanNode(
  span: Span,
  allSpans: Span[],
  checkpoints: Checkpoint[],
  depth: number,
): void {
  const indent = '  '.repeat(depth);
  const cpIndicator = checkpoints.some((cp) => cp.spanId === span.id) ? ' [CP]' : '';
  console.log(`${indent}${span.kind}: ${span.name}${cpIndicator}`);

  const children = allSpans.filter((s) => s.parentId === span.id);
  for (const child of children) {
    printSpanNode(child, allSpans, checkpoints, depth + 1);
  }
}

export const exploreCommand = new Command('explore')
  .description('Explore a trace file interactively')
  .requiredOption('-t, --trace <path>', 'Path to the trace file')
  .option('-f, --format <format>', 'Output format (table, json, tree)', 'table')
  .action(explore);
