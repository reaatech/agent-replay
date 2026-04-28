# Replay Debugging Skill

## Overview

The Replay Debugging skill focuses on using deterministic replay to debug agent behaviors, identify issues, and validate fixes without consuming LLM tokens. This is the primary debugging methodology for Agent Replay.

## Core Principles

### 1. Deterministic Reproduction

- Exact reproduction of agent behavior
- Consistent results across replays
- Reliable bug reproduction
- Predictable debugging experience

### 2. Token Efficiency

- Debug without spending tokens
- Reuse recorded LLM responses
- Minimize live LLM calls
- Cost-effective debugging

### 3. Incremental Investigation

- Step-by-step execution
- Checkpoint-based debugging
- Partial replay for focused analysis
- Gradual problem isolation

## Debugging Modes

### 1. Stubbed Replay Mode

```typescript
// ✅ Good: Complete stubbed replay
class StubbedReplayDebugger {
  async debug(trace: Trace, agentCode: AgentCode): Promise<DebugResult> {
    // Activate stub engine with recorded responses
    this.stubEngine.activate(trace);

    // Run agent with stubbed LLM calls
    const result = await agentCode.run();

    // Verify deterministic behavior
    const verification = this.verifyDeterminism(trace, result);

    return {
      output: result,
      deterministic: verification.match,
      differences: verification.differences,
    };
  }
}
```

### 2. Partial Replay Mode

```typescript
// ✅ Good: Debug specific failure points
class PartialReplayDebugger {
  async debugFromCheckpoint(
    trace: Trace,
    checkpointId: string,
    agentCode: AgentCode
  ): Promise<DebugResult> {
    // Load checkpoint state
    const checkpoint = trace.checkpoints.find(cp => cp.id === checkpointId);
    if (!checkpoint) throw new Error('Checkpoint not found');

    // Restore state from checkpoint
    await this.stateManager.restore(checkpoint.state);

    // Replay up to checkpoint with stubs
    await this.replayToCheckpoint(trace, checkpoint);

    // Go live from checkpoint
    this.stubEngine.deactivate();

    // Continue with live LLM calls
    const result = await agentCode.run();

    // Track divergence from original trace
    const divergence = this.detectDivergence(trace, result, checkpoint);

    return {
      output: result,
      divergence,
      checkpoint,
    };
  }
}
```

### 3. Diff Mode

```typescript
// ✅ Good: Compare stubbed vs live behavior
class DiffModeDebugger {
  async compareBehaviors(trace: Trace, agentCode: AgentCode): Promise<DiffReport> {
    // Run stubbed replay
    const stubbedResult = await this.stubbedReplay(trace, agentCode);

    // Run live replay
    const liveResult = await this.liveReplay(trace, agentCode);

    // Compare outputs
    const comparison = await this.diffEngine.compare(stubbedResult, liveResult, {
      includeSemantic: true,
      includeStructural: true,
    });

    return {
      stubbed: stubbedResult,
      live: liveResult,
      differences: comparison.differences,
      severity: comparison.severity,
      recommendations: comparison.recommendations,
    };
  }
}
```

## Debugging Workflows

### 1. Bug Reproduction

#### Step-by-Step Reproduction

```typescript
// ✅ Good: Systematic bug reproduction
class BugReproducer {
  async reproduceBug(trace: Trace, bugDescription: string): Promise<BugReport> {
    // 1. Identify relevant trace section
    const relevantSection = await this.identifyRelevantSection(trace, bugDescription);

    // 2. Find checkpoint before issue
    const checkpoint = await this.findPreIssueCheckpoint(trace, relevantSection);

    // 3. Replay up to checkpoint
    await this.replayToCheckpoint(trace, checkpoint);

    // 4. Execute step-by-step through issue
    const stepResults = await this.executeStepByStep(trace, relevantSection);

    // 5. Identify exact failure point
    const failurePoint = this.identifyFailurePoint(stepResults);

    return {
      bugDescription,
      relevantSection,
      checkpoint,
      failurePoint,
      stepResults,
      rootCause: this.analyzeRootCause(failurePoint),
    };
  }
}
```

#### State Inspection

```typescript
// ✅ Good: Inspect state at any point
class StateInspector {
  async inspectState(trace: Trace, targetTime: number): Promise<StateSnapshot> {
    // Find nearest checkpoint
    const checkpoint = this.findNearestCheckpoint(trace, targetTime);

    // Reconstruct state
    const state = await this.reconstructState(trace, checkpoint, targetTime);

    return {
      timestamp: targetTime,
      variables: state.variables,
      memory: state.memory,
      conversation: state.conversation,
      activeSpans: this.getActiveSpans(trace, targetTime),
      pendingOperations: this.getPendingOperations(trace, targetTime),
    };
  }
}
```

### 2. Fix Validation

#### Regression Testing

```typescript
// ✅ Good: Validate fixes with replay
class FixValidator {
  async validateFix(
    originalTrace: Trace,
    fixedAgentCode: AgentCode,
    bugDescription: string
  ): Promise<ValidationResult> {
    // 1. Reproduce original bug
    const originalResult = await this.reproduceBug(originalTrace, bugDescription);

    // 2. Apply fix and replay
    const fixedResult = await this.replayWithFix(originalTrace, fixedAgentCode);

    // 3. Compare behaviors
    const comparison = await this.compareBehaviors(originalResult, fixedResult);

    // 4. Verify bug is fixed
    const bugFixed = this.verifyBugFixed(comparison, bugDescription);

    // 5. Check for regressions
    const regressions = await this.checkForRegression(originalTrace, fixedResult);

    return {
      bugFixed,
      regressions,
      comparison,
      confidence: this.calculateConfidence(bugFixed, regressions),
      recommendations: this.generateRecommendations(comparison),
    };
  }
}
```

#### Edge Case Testing

```typescript
// ✅ Good: Test edge cases with replay
class EdgeCaseTester {
  async testEdgeCases(
    baseTrace: Trace,
    agentCode: AgentCode,
    variations: TraceVariation[]
  ): Promise<EdgeCaseReport> {
    const results: EdgeCaseResult[] = [];

    for (const variation of variations) {
      // Modify trace according to variation
      const modifiedTrace = this.applyVariation(baseTrace, variation);

      // Replay with modified trace
      const result = await this.replay(modifiedTrace, agentCode);

      // Check for unexpected behavior
      const issues = this.detectEdgeCaseIssues(result, variation);

      results.push({
        variation,
        result,
        issues,
      });
    }

    return {
      baseTrace: baseTrace.metadata.id,
      totalVariations: variations.length,
      issuesFound: results.filter(r => r.issues.length > 0).length,
      results,
    };
  }
}
```

## Advanced Debugging Techniques

### 1. Conditional Breakpoints

```typescript
// ✅ Good: Conditional debugging
class ConditionalDebugger {
  async debugWithBreakpoints(trace: Trace, breakpoints: Breakpoint[]): Promise<DebugSession> {
    const session = new DebugSession(trace);

    for (const span of trace.spans) {
      // Check if we should break
      const shouldBreak = breakpoints.some(bp => this.matchesBreakpoint(span, bp));

      if (shouldBreak) {
        // Pause and inspect
        const state = await this.inspectState(trace, span.startTime);
        session.addBreakpointHit(span, state);

        // Allow user interaction (in interactive mode)
        if (this.isInteractive) {
          await this.waitForUserInput();
        }
      }

      // Execute span
      await this.executeSpan(span);
    }

    return session;
  }
}
```

### 2. Watch Expressions

```typescript
// ✅ Good: Watch variables during replay
class WatchExpressionEvaluator {
  async evaluateWatchExpressions(trace: Trace, expressions: string[]): Promise<WatchResult[]> {
    const results: WatchResult[] = [];

    for (const expression of expressions) {
      const values: WatchValue[] = [];

      // Evaluate expression at each relevant point
      for (const checkpoint of trace.checkpoints) {
        const state = await this.reconstructState(trace, checkpoint);
        const value = await this.evaluateExpression(expression, state);

        values.push({
          checkpoint: checkpoint.id,
          timestamp: checkpoint.timestamp,
          value,
        });
      }

      results.push({
        expression,
        values,
        changes: this.detectChanges(values),
      });
    }

    return results;
  }
}
```

### 3. Time Travel Debugging

```typescript
// ✅ Good: Navigate through execution history
class TimeTravelDebugger {
  private history: StateSnapshot[] = [];
  private currentPosition = 0;

  async stepForward(trace: Trace): Promise<StateSnapshot> {
    if (this.currentPosition >= this.history.length - 1) {
      // Need to execute next step
      const nextSpan = trace.spans[this.currentPosition];
      await this.executeSpan(nextSpan);
      const state = await this.captureState();
      this.history.push(state);
    }

    this.currentPosition++;
    return this.history[this.currentPosition];
  }

  async stepBackward(): Promise<StateSnapshot> {
    if (this.currentPosition > 0) {
      this.currentPosition--;
      await this.restoreState(this.history[this.currentPosition]);
      return this.history[this.currentPosition];
    }
    throw new Error('Already at beginning');
  }

  async goToCheckpoint(checkpointId: string): Promise<StateSnapshot> {
    const checkpointIndex = this.history.findIndex(s => s.checkpoint?.id === checkpointId);

    if (checkpointIndex === -1) {
      throw new Error('Checkpoint not found in history');
    }

    this.currentPosition = checkpointIndex;
    await this.restoreState(this.history[checkpointIndex]);
    return this.history[checkpointIndex];
  }
}
```

## Debugging Tools

### 1. Interactive Debugger

```typescript
// ✅ Good: Interactive debugging interface
class InteractiveDebugger {
  async startDebugSession(trace: Trace): Promise<void> {
    console.log('Starting interactive debug session...');
    console.log(`Trace: ${trace.metadata.name}`);
    console.log(`Spans: ${trace.spans.length}`);
    console.log(`Duration: ${trace.metadata.summary.duration}ms`);

    const state = new DebuggerState(trace);

    while (!state.isComplete) {
      const command = await this.promptUser();

      switch (command) {
        case 'next':
          await state.stepForward();
          break;
        case 'continue':
          await state.continue();
          break;
        case 'inspect':
          await this.showState(state.currentState);
          break;
        case 'watch':
          await this.addWatchExpression(state);
          break;
        case 'backtrace':
          await this.showCallStack(state);
          break;
        case 'quit':
          state.isComplete = true;
          break;
      }
    }
  }
}
```

### 2. Visual Debugger

```typescript
// ✅ Good: Visual debugging interface
class VisualDebugger {
  createDebugView(trace: Trace): DebugView {
    return {
      timeline: {
        spans: trace.spans.map(span => ({
          id: span.id,
          name: span.name,
          kind: span.kind,
          startTime: span.startTime,
          duration: span.endTime - span.startTime,
          status: span.status,
          errors: this.extractErrors(span),
        })),
        checkpoints: trace.checkpoints.map(cp => ({
          id: cp.id,
          timestamp: cp.timestamp,
          state: cp.state,
        })),
      },
      controls: {
        play: true,
        pause: true,
        stepForward: true,
        stepBackward: true,
        goToCheckpoint: true,
      },
      inspectors: {
        state: true,
        variables: true,
        callStack: true,
        watchExpressions: true,
      },
    };
  }
}
```

## Best Practices

### 1. Systematic Debugging

- Start with high-level trace overview
- Identify suspicious patterns
- Focus on specific time ranges
- Use checkpoints strategically
- Validate hypotheses incrementally

### 2. Efficient Resource Usage

- Use stubbed mode when possible
- Limit live replay to necessary sections
- Cache reconstructed states
- Clean up debug sessions properly

### 3. Documentation

- Document debugging findings
- Create reproducible debug scenarios
- Share debugging insights
- Build debugging playbooks

## Resources

### Documentation

- [Debugging with Deterministic Replay](https://docs.agent-replay.dev/debugging)
- [Partial Replay Guide](https://docs.agent-replay.dev/partial-replay)
- [Debugging Best Practices](https://docs.agent-replay.dev/best-practices)

### Tools

- Agent Replay CLI - Command-line debugging
- Web UI Debugger - Visual debugging interface
- VS Code Extension - IDE integration
- Trace Analyzer - Advanced analysis tools

---

**Maintained by**: @reaatech and contributors  
**Last Updated**: 2026-04-22
