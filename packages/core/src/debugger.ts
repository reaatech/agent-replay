import type { Trace, Span, SpanKind, Event, SerializedState } from '@reaatech/shared';

/** Condition that determines when a breakpoint should trigger. */
export interface BreakpointCondition {
  /** Match by span kind */
  kind?: SpanKind;
  /** Match by span name (exact or regex) */
  name?: string | RegExp;
  /** Match by span index */
  stepIndex?: number;
  /** Custom predicate evaluated against the span */
  predicate?: (span: Span, stepIndex: number, trace: Trace) => boolean;
}

/** A breakpoint that pauses replay at a matching span. */
export interface Breakpoint {
  id: string;
  condition: BreakpointCondition;
  enabled: boolean;
}

/** A watchpoint that evaluates an expression at each step. */
export interface Watchpoint {
  id: string;
  expression: string;
  enabled: boolean;
}

/** Result of evaluating a watch expression at a specific step. */
export interface WatchValue {
  step: number;
  spanId: string;
  timestamp: number;
  value: unknown;
}

/** Result of a watch expression across all steps. */
export interface WatchResult {
  expression: string;
  values: WatchValue[];
  changes: Array<{ from: number; to: number; before: unknown; after: unknown }>;
}

/** Snapshot of state at a specific point in the trace. */
export interface DebugSnapshot {
  step: number;
  span: Span;
  timestamp: number;
  state?: SerializedState;
  variables: Record<string, unknown>;
}

/** Session that tracks step-through debugging state. */
export interface DebugSession {
  trace: Trace;
  currentStep: number;
  history: DebugSnapshot[];
  breakpoints: Breakpoint[];
  watchpoints: Watchpoint[];
  hitBreakpoints: Array<{ step: number; breakpointId: string; span: Span }>;
  /** True if the last stepForward paused at a breakpoint */
  paused: boolean;
}

/**
 * ReplayDebugger provides step-through debugging, breakpoints, and watchpoints
 * for agent traces. It allows developers to inspect state at each step,
 * set conditional breakpoints, and evaluate watch expressions.
 */
export class ReplayDebugger {
  private session: DebugSession;
  private onBreakpointHit?: (
    hit: DebugSession['hitBreakpoints'][number],
    session: DebugSession
  ) => Promise<boolean> | boolean;
  private onStep?: (snapshot: DebugSnapshot, session: DebugSession) => void;

  constructor(trace: Trace) {
    this.session = {
      trace,
      currentStep: -1,
      history: [],
      breakpoints: [],
      watchpoints: [],
      hitBreakpoints: [],
      paused: false,
    };
  }

  /** Add a breakpoint. */
  addBreakpoint(condition: BreakpointCondition): Breakpoint {
    const bp: Breakpoint = {
      id: `bp-${this.session.breakpoints.length}`,
      condition,
      enabled: true,
    };
    this.session.breakpoints.push(bp);
    return bp;
  }

  /** Remove a breakpoint by ID. */
  removeBreakpoint(id: string): void {
    this.session.breakpoints = this.session.breakpoints.filter(bp => bp.id !== id);
  }

  /** Toggle breakpoint enabled state. */
  toggleBreakpoint(id: string): void {
    const bp = this.session.breakpoints.find(b => b.id === id);
    if (bp) bp.enabled = !bp.enabled;
  }

  /** Add a watchpoint. */
  addWatchpoint(expression: string): Watchpoint {
    const wp: Watchpoint = {
      id: `wp-${this.session.watchpoints.length}`,
      expression,
      enabled: true,
    };
    this.session.watchpoints.push(wp);
    return wp;
  }

  /** Remove a watchpoint by ID. */
  removeWatchpoint(id: string): void {
    this.session.watchpoints = this.session.watchpoints.filter(wp => wp.id !== id);
  }

  /** Set callback invoked when a breakpoint is hit. Return false to continue. */
  setBreakpointHandler(
    handler: (
      hit: DebugSession['hitBreakpoints'][number],
      session: DebugSession
    ) => Promise<boolean> | boolean
  ): void {
    this.onBreakpointHit = handler;
  }

  /** Set callback invoked after each step. */
  setStepHandler(handler: (snapshot: DebugSnapshot, session: DebugSession) => void): void {
    this.onStep = handler;
  }

  /** Check if a span matches a breakpoint condition. */
  matchesBreakpoint(span: Span, stepIndex: number, condition: BreakpointCondition): boolean {
    if (condition.kind && span.kind !== condition.kind) return false;
    if (condition.name) {
      if (typeof condition.name === 'string') {
        if (span.name !== condition.name) return false;
      } else if (!condition.name.test(span.name)) {
        return false;
      }
    }
    if (condition.stepIndex !== undefined && stepIndex !== condition.stepIndex) return false;
    if (condition.predicate && !condition.predicate(span, stepIndex, this.session.trace))
      return false;
    return true;
  }

  /** Start a new debug session from the beginning. */
  start(): DebugSession {
    this.session.currentStep = -1;
    this.session.history = [];
    this.session.hitBreakpoints = [];
    this.session.paused = false;
    return this.session;
  }

  /** Step forward to the next span. Returns the snapshot or null if finished. */
  async stepForward(): Promise<DebugSnapshot | null> {
    const nextStep = this.session.currentStep + 1;
    if (nextStep >= this.session.trace.spans.length) {
      return null;
    }

    const span = this.session.trace.spans[nextStep];
    const snapshot = this.createSnapshot(nextStep, span);
    this.session.history.push(snapshot);
    this.session.currentStep = nextStep;

    // Check breakpoints
    let shouldPause = false;
    for (const bp of this.session.breakpoints) {
      if (!bp.enabled) continue;
      if (this.matchesBreakpoint(span, nextStep, bp.condition)) {
        const hit = { step: nextStep, breakpointId: bp.id, span };
        this.session.hitBreakpoints.push(hit);
        if (this.onBreakpointHit) {
          const pause = await this.onBreakpointHit(hit, this.session);
          if (pause) shouldPause = true;
        }
      }
    }

    this.session.paused = shouldPause;

    if (this.onStep) {
      this.onStep(snapshot, this.session);
    }

    return snapshot;
  }

  /** Step backward to the previous span. */
  stepBackward(): DebugSnapshot | null {
    if (this.session.currentStep <= 0) {
      return null;
    }
    this.session.currentStep--;
    return this.session.history[this.session.currentStep];
  }

  /** Jump to a specific step index. */
  goToStep(stepIndex: number): DebugSnapshot | null {
    if (stepIndex < 0 || stepIndex >= this.session.trace.spans.length) {
      return null;
    }
    this.session.currentStep = stepIndex;
    while (this.session.history.length <= stepIndex) {
      const span = this.session.trace.spans[this.session.history.length];
      const snapshot = this.createSnapshot(this.session.history.length, span);
      this.session.history.push(snapshot);
    }
    return this.session.history[stepIndex] ?? null;
  }

  /** Jump to the checkpoint nearest to a step. */
  goToCheckpoint(checkpointId: string): DebugSnapshot | null {
    const cp = this.session.trace.checkpoints.find(c => c.id === checkpointId);
    if (!cp) return null;
    const spanIndex = this.session.trace.spans.findIndex(s => s.id === cp.spanId);
    if (spanIndex === -1) return null;
    return this.goToStep(spanIndex);
  }

  /** Continue execution until the next breakpoint or end. */
  async continue(): Promise<DebugSnapshot | null> {
    while (this.session.currentStep < this.session.trace.spans.length - 1) {
      const snapshot = await this.stepForward();
      if (!snapshot) return null;

      if (this.session.paused) {
        return snapshot;
      }
    }
    return this.session.history[this.session.currentStep] ?? null;
  }

  /** Run until completion and collect all watch results. */
  async runToCompletion(): Promise<{ session: DebugSession; watchResults: WatchResult[] }> {
    this.start();
    while (await this.stepForward()) {
      /* run to end */
    }

    const watchResults = this.evaluateWatchpoints();
    return { session: this.session, watchResults };
  }

  /** Evaluate all watch expressions across the trace history. */
  evaluateWatchpoints(): WatchResult[] {
    return this.session.watchpoints
      .filter(wp => wp.enabled)
      .map(wp => {
        const values: WatchValue[] = this.session.history.map((snap, i) => ({
          step: i,
          spanId: snap.span.id,
          timestamp: snap.timestamp,
          value: this.evaluateExpression(wp.expression, snap),
        }));

        return {
          expression: wp.expression,
          values,
          changes: this.detectChanges(values),
        };
      });
  }

  /** Evaluate a simple expression against a snapshot's variables. */
  evaluateExpression(expression: string, snapshot: DebugSnapshot): unknown {
    // Support dot-notation paths like "state.variables.count"
    const parts = expression.split('.');
    let value: unknown = snapshot;
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  /** Inspect variables at the current step. */
  inspectVariables(): Record<string, unknown> {
    const snap = this.session.history[this.session.currentStep];
    return snap?.variables ?? {};
  }

  /** Inspect the current span's events. */
  inspectEvents(): Event[] {
    const snap = this.session.history[this.session.currentStep];
    return snap?.span.events ?? [];
  }

  /** Get the current session state. */
  getSession(): DebugSession {
    return this.session;
  }

  private createSnapshot(step: number, span: Span): DebugSnapshot {
    const checkpoint = this.session.trace.checkpoints.find(c => c.spanId === span.id);
    return {
      step,
      span,
      timestamp: span.startTime,
      state: checkpoint?.state,
      variables: {
        ...(checkpoint?.state?.variables ?? {}),
        ...checkpoint?.context.variables,
        step,
        spanKind: span.kind,
        spanName: span.name,
      },
    };
  }

  private detectChanges(
    values: WatchValue[]
  ): Array<{ from: number; to: number; before: unknown; after: unknown }> {
    const changes: Array<{ from: number; to: number; before: unknown; after: unknown }> = [];
    for (let i = 1; i < values.length; i++) {
      if (JSON.stringify(values[i - 1].value) !== JSON.stringify(values[i].value)) {
        changes.push({
          from: values[i - 1].step,
          to: values[i].step,
          before: values[i - 1].value,
          after: values[i].value,
        });
      }
    }
    return changes;
  }
}

/**
 * Format a debug session into a human-readable report.
 */
export function formatDebugSession(session: DebugSession): string {
  const lines = [
    `Debug Session: ${session.trace.metadata.name}`,
    `  Current step: ${session.currentStep + 1} / ${session.trace.spans.length}`,
    `  Breakpoints: ${session.breakpoints.length} (${session.breakpoints.filter(b => b.enabled).length} enabled)`,
    `  Watchpoints: ${session.watchpoints.length}`,
    `  Breakpoint hits: ${session.hitBreakpoints.length}`,
    '',
  ];

  if (session.hitBreakpoints.length > 0) {
    lines.push('Breakpoint hits:');
    for (const hit of session.hitBreakpoints) {
      lines.push(`  Step ${hit.step}: ${hit.span.name} (${hit.span.kind})`);
    }
    lines.push('');
  }

  if (session.currentStep >= 0 && session.currentStep < session.trace.spans.length) {
    const span = session.trace.spans[session.currentStep];
    lines.push(`Current span: ${span.name} (${span.kind})`);
    lines.push(`  Events: ${span.events.length}`);
    for (const evt of span.events) {
      lines.push(`    [${evt.type}] ${evt.name}`);
    }
  }

  return lines.join('\n');
}
