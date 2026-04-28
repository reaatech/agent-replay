import { Command } from 'commander';
import {
  LocalFileStorage,
  ReplayDebugger,
  AnnotationManager,
  formatDebugSession,
} from '@reaatech/core';
import type { SpanKind } from '@reaatech/shared';

export interface DebugOptions {
  trace: string;
  span?: string;
  kind?: string;
  step?: string;
  watch: string[];
  annotations?: boolean;
}

export async function debug(options: DebugOptions): Promise<void> {
  const storage = new LocalFileStorage();

  try {
    const trace = await storage.load(options.trace);

    const debugger_ = new ReplayDebugger(trace);
    const annotations = new AnnotationManager();
    annotations.loadFromTrace(trace);

    // Add breakpoint from CLI options
    if (options.span || options.kind || options.step !== undefined) {
      const condition: Parameters<typeof debugger_.addBreakpoint>[0] = {};
      if (options.kind) condition.kind = options.kind as SpanKind;
      if (options.span) condition.name = options.span;
      if (options.step !== undefined) condition.stepIndex = parseInt(options.step, 10);
      debugger_.addBreakpoint(condition);
    }

    // Add watchpoints
    for (const expr of options.watch ?? []) {
      debugger_.addWatchpoint(expr);
    }

    console.log(`Debugging trace: ${trace.metadata.name}`);
    console.log(`Spans: ${trace.spans.length} | Checkpoints: ${trace.checkpoints.length}`);
    if (debugger_.getSession().breakpoints.length > 0) {
      console.log(`Breakpoints: ${debugger_.getSession().breakpoints.length}`);
    }
    if ((options.watch ?? []).length > 0) {
      console.log(`Watchpoints: ${(options.watch ?? []).join(', ')}`);
    }
    console.log('');

    debugger_.start();

    // Step through and display
    let snapshot = await debugger_.stepForward();
    while (snapshot !== null) {
      const span = snapshot.span;
      const prefix = `[${snapshot.step}] ${span.name} (${span.kind})`;

      if (span.status === 'error') {
        console.log(`\x1b[31m${prefix} [ERROR]\x1b[0m`);
      } else {
        console.log(prefix);
      }

      // Show events
      for (const evt of span.events) {
        const data = evt.data ? JSON.stringify(evt.data).slice(0, 80) : '';
        console.log(`  [${evt.type}] ${evt.name} ${data}`);
      }

      // Show annotations
      if (options.annotations) {
        const spanAnnotations = annotations.getForSpan(span.id);
        for (const ann of spanAnnotations) {
          const sev = ann.severity ? `[${ann.severity.toUpperCase()}] ` : '';
          console.log(`  \x1b[33m${sev}Annotation by ${ann.author}: ${ann.content}\x1b[0m`);
        }
      }

      // Show watch values at this step
      const watchResults = debugger_.evaluateWatchpoints();
      for (const wr of watchResults) {
        const current = wr.values.find(v => v.step === snapshot!.step);
        if (current) {
          const changed = wr.changes.some(c => c.to === snapshot!.step);
          const color = changed ? '\x1b[36m' : '\x1b[90m';
          console.log(
            `  ${color}Watch "${wr.expression}" = ${JSON.stringify(current.value)}${changed ? ' *changed*' : ''}\x1b[0m`
          );
        }
      }

      console.log('');
      snapshot = await debugger_.stepForward();
    }

    // Final summary
    console.log(formatDebugSession(debugger_.getSession()));

    // Show all watch changes
    const watchResults = debugger_.evaluateWatchpoints();
    for (const wr of watchResults) {
      if (wr.changes.length > 0) {
        console.log(`\nWatch "${wr.expression}" changed ${wr.changes.length} time(s):`);
        for (const ch of wr.changes) {
          console.log(
            `  Step ${ch.from} → ${ch.to}: ${JSON.stringify(ch.before)} → ${JSON.stringify(ch.after)}`
          );
        }
      }
    }
  } catch (err) {
    console.error(`Failed to load trace "${options.trace}":`, (err as Error).message);
    process.exit(1);
  }
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export const debugCommand = new Command('debug')
  .description('Debug a trace with step-through, breakpoints, and watchpoints')
  .requiredOption('-t, --trace <path>', 'Path to the trace file')
  .option('-s, --span <name>', 'Break on span name (exact match)')
  .option(
    '-k, --kind <kind>',
    'Break on span kind (llm_call, tool_call, agent_step, routing_decision, state_change, error)'
  )
  .option('--step <number>', 'Break at a specific step index')
  .option(
    '-w, --watch <expr>',
    'Add a watch expression (can be used multiple times)',
    collect,
    [] as string[]
  )
  .option('--annotations', 'Show annotations for each span', false)
  .action(debug);
