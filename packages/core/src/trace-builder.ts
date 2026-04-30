import type {
  Checkpoint,
  Event,
  RecordingConfig,
  SerializedState,
  Span,
  SpanKind,
  Trace,
  TraceMetadata,
} from '@reaatech/agent-replay-shared';

function findLast<T>(arr: T[], predicate: (item: T) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return arr[i];
  }
  return undefined;
}

export class TraceBuilder {
  private traceCounter = 0;

  create(config: RecordingConfig): Trace {
    const id = `trace-${Date.now()}-${this.traceCounter++}`;
    const metadata: TraceMetadata = {
      id,
      name: config.name,
      createdAt: Date.now(),
      agentVersion: process.env.npm_package_version ?? '0.0.0',
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      tags: config.tags ?? [],
      summary: {
        id,
        name: config.name,
        spanCount: 0,
        duration: 0,
      },
    };

    const trace: Trace = {
      version: '1.0.0',
      metadata,
      spans: [],
      checkpoints: [],
      indexes: {
        byId: {},
        byKind: {
          llm_call: [],
          tool_call: [],
          agent_step: [],
          routing_decision: [],
          state_change: [],
          error: [],
        },
      },
    };

    return trace;
  }

  startSpan(trace: Trace, name: string, kind: SpanKind): Span {
    const span: Span = {
      id: `span-${trace.spans.length}`,
      name,
      kind,
      startTime: Date.now(),
      status: 'in_progress',
      events: [],
      attributes: {},
      links: [],
    };
    trace.spans.push(span);
    return span;
  }

  endSpan(trace: Trace, spanId: string, status: 'ok' | 'error' = 'ok'): void {
    const span = trace.spans.find((s) => s.id === spanId);
    if (span) {
      span.status = status;
      span.endTime = Date.now();
    }
  }

  addEvent(trace: Trace, event: Event): void {
    const currentSpan = findLast(trace.spans, (s) => s.status === 'in_progress');
    if (currentSpan) {
      currentSpan.events.push(event);
    }
  }

  addEventToSpan(trace: Trace, spanId: string, event: Event): void {
    const span = trace.spans.find((s) => s.id === spanId);
    if (span) {
      span.events.push(event);
    }
  }

  addCheckpoint(trace: Trace, state: unknown): void {
    const checkpoint: Checkpoint = {
      id: `cp-${trace.checkpoints.length}`,
      spanId: trace.spans[trace.spans.length - 1]?.id ?? 'unknown',
      timestamp: Date.now(),
      state: this.serializeState(state),
      context: { sessionId: trace.metadata.id, variables: {} },
      metadata: { name: `checkpoint-${trace.checkpoints.length}` },
    };
    trace.checkpoints.push(checkpoint);
  }

  finalize(trace: Trace): Trace {
    trace.metadata.summary.spanCount = trace.spans.length;
    trace.metadata.summary.duration =
      trace.spans.length > 0
        ? (trace.spans[trace.spans.length - 1].endTime ?? Date.now()) - trace.spans[0].startTime
        : 0;

    // Build indexes
    trace.spans.forEach((span, index) => {
      trace.indexes.byId[span.id] = index;
      trace.indexes.byKind[span.kind].push(index);
    });

    return trace;
  }

  private serializeState(state: unknown): SerializedState {
    try {
      const cloned =
        typeof state === 'object' && state !== null
          ? (structuredClone(state) as Record<string, unknown>)
          : {};
      return {
        variables: cloned,
        memory: { entries: [] },
        conversation: { messages: [] },
        toolRegistry: { tools: [] },
      };
    } catch {
      return {
        variables:
          typeof state === 'object' && state !== null
            ? { ...(state as Record<string, unknown>) }
            : {},
        memory: { entries: [] },
        conversation: { messages: [] },
        toolRegistry: { tools: [] },
      };
    }
  }
}
