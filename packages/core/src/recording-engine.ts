import {
  type Trace,
  type RecordingConfig,
  type Event,
  type SpanKind,
  type CaptureContext,
  RecordingFailedError,
} from '@reaatech/shared';

import { TraceBuilder } from './trace-builder.js';

export class RecordingEngine {
  private traceBuilder: TraceBuilder;
  private activeSession: RecordingSession | null = null;

  constructor() {
    this.traceBuilder = new TraceBuilder();
  }

  startRecording(config: RecordingConfig): RecordingSession {
    if (this.activeSession) {
      throw new RecordingFailedError('Recording already in progress');
    }

    const trace = this.traceBuilder.create(config);
    this.activeSession = new RecordingSession(trace, this);
    return this.activeSession;
  }

  stopRecording(session: RecordingSession): Trace {
    if (this.activeSession !== session) {
      throw new RecordingFailedError('Invalid recording session');
    }

    const trace = this.traceBuilder.finalize(session.trace);
    this.activeSession = null;
    return trace;
  }

  startSpan(name: string, kind: SpanKind): string {
    if (!this.activeSession) {
      throw new RecordingFailedError('No active recording session');
    }
    const span = this.traceBuilder.startSpan(this.activeSession.trace, name, kind);
    return span.id;
  }

  endSpan(spanId: string, status?: 'ok' | 'error'): void {
    if (!this.activeSession) {
      throw new RecordingFailedError('No active recording session');
    }
    this.traceBuilder.endSpan(this.activeSession.trace, spanId, status ?? 'ok');
  }

  captureEvent(event: Event, context: CaptureContext): void {
    if (!this.activeSession) {
      throw new RecordingFailedError('No active recording session');
    }

    if (context.spanId) {
      this.traceBuilder.addEventToSpan(this.activeSession.trace, context.spanId, event);
    } else {
      this.traceBuilder.addEvent(this.activeSession.trace, event);
    }
  }

  createCheckpoint(session: RecordingSession, state: unknown): void {
    if (!this.activeSession || this.activeSession !== session) {
      throw new RecordingFailedError('No active recording session');
    }

    this.traceBuilder.addCheckpoint(session.trace, state);
  }

  createActiveSessionCheckpoint(state: unknown): void {
    if (!this.activeSession) {
      throw new RecordingFailedError('No active recording session');
    }
    this.traceBuilder.addCheckpoint(this.activeSession.trace, state);
  }

  get isRecording(): boolean {
    return this.activeSession !== null;
  }
}

export class RecordingSession {
  readonly trace: Trace;
  private engine: RecordingEngine;

  constructor(trace: Trace, engine: RecordingEngine) {
    this.trace = trace;
    this.engine = engine;
  }

  captureEvent(event: Event, context: CaptureContext): void {
    this.engine.captureEvent(event, context);
  }

  createCheckpoint(state: unknown): void {
    this.engine.createCheckpoint(this, state);
  }
}
