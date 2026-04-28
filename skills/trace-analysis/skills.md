# Trace Analysis Skill

## Overview

The Trace Analysis skill focuses on examining, understanding, and deriving insights from agent interaction traces. This skill is essential for debugging agent behavior, identifying performance bottlenecks, and understanding agent decision-making processes.

## Core Competencies

### 1. Trace Structure Understanding

- Hierarchical span relationships
- Event sequencing and timing
- State transitions and checkpoints
- Error propagation patterns

### 2. Pattern Recognition

- Identifying common failure modes
- Recognizing performance anti-patterns
- Detecting anomalous behavior
- Understanding routing decisions

### 3. Root Cause Analysis

- Tracing error origins
- Following decision chains
- Identifying contributing factors
- Isolating variables

## Analysis Techniques

### 1. Visual Analysis

#### Timeline Visualization

```typescript
// ✅ Good: Interactive timeline view
class TraceTimelineVisualizer {
  render(trace: Trace): TimelineView {
    const spans = this.sortByStartTime(trace.spans);
    const lanes = this.assignLanes(spans);

    return {
      lanes,
      duration: trace.metadata.summary.duration,
      checkpoints: trace.checkpoints,
      errors: this.extractErrors(trace),
    };
  }

  private assignLanes(spans: Span[]): Lane[] {
    // Assign spans to lanes to avoid overlaps
    const lanes: Lane[] = [];
    const laneEndTimes: number[] = [];

    spans.forEach(span => {
      let assigned = false;
      for (let i = 0; i < laneEndTimes.length; i++) {
        if (span.startTime >= laneEndTimes[i]) {
          lanes[i].push(span);
          laneEndTimes[i] = span.endTime || span.startTime;
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        lanes.push([span]);
        laneEndTimes.push(span.endTime || span.startTime);
      }
    });

    return lanes;
  }
}
```

#### Call Graph Analysis

```typescript
// ✅ Good: Generate call graphs from traces
class CallGraphAnalyzer {
  generateCallGraph(trace: Trace): CallGraph {
    const nodes = new Map<string, CallGraphNode>();
    const edges: CallGraphEdge[] = [];

    // Create nodes for each span
    trace.spans.forEach(span => {
      nodes.set(span.id, {
        id: span.id,
        name: span.name,
        kind: span.kind,
        duration: span.endTime - span.startTime,
        status: span.status,
      });
    });

    // Create edges from parent-child relationships
    trace.spans.forEach(span => {
      if (span.parentId && nodes.has(span.parentId)) {
        edges.push({
          source: span.parentId,
          target: span.id,
          type: this.getRelationshipType(span),
        });
      }
    });

    return { nodes: Array.from(nodes.values()), edges };
  }

  private getRelationshipType(span: Span): string {
    switch (span.kind) {
      case 'llm_call':
        return 'calls';
      case 'tool_call':
        return 'invokes';
      case 'routing_decision':
        return 'routes_to';
      default:
        return 'contains';
    }
  }
}
```

### 2. Statistical Analysis

#### Performance Metrics

```typescript
// ✅ Good: Calculate comprehensive metrics
class TraceMetricsAnalyzer {
  analyze(trace: Trace): TraceMetrics {
    const spanMetrics = this.analyzeSpans(trace.spans);
    const llmMetrics = this.analyzeLLMCalls(trace.spans);
    const toolMetrics = this.analyzeToolCalls(trace.spans);

    return {
      totalDuration: trace.metadata.summary.duration,
      spanCount: trace.spans.length,
      checkpointCount: trace.checkpoints.length,
      errorCount: this.countErrors(trace),
      ...spanMetrics,
      ...llmMetrics,
      ...toolMetrics,
    };
  }

  private analyzeLLMCalls(spans: Span[]): LLMMetrics {
    const llmSpans = spans.filter(s => s.kind === 'llm_call');
    const durations = llmSpans.map(s => s.endTime - s.startTime);

    return {
      llmCallCount: llmSpans.length,
      avgLLMDuration: this.average(durations),
      maxLLMDuration: Math.max(...durations),
      minLLMDuration: Math.min(...durations),
      totalLLMDuration: this.sum(durations),
      llmErrorRate: llmSpans.filter(s => s.status === 'error').length / llmSpans.length,
    };
  }
}
```

#### Distribution Analysis

```typescript
// ✅ Good: Analyze metric distributions
class DistributionAnalyzer {
  analyzeDistribution(values: number[]): DistributionStats {
    const sorted = [...values].sort((a, b) => a - b);
    const p50 = this.percentile(sorted, 50);
    const p90 = this.percentile(sorted, 90);
    const p95 = this.percentile(sorted, 95);
    const p99 = this.percentile(sorted, 99);

    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: this.mean(values),
      median: p50,
      p90,
      p95,
      p99,
      stdDev: this.standardDeviation(values),
    };
  }
}
```

### 3. Anomaly Detection

#### Statistical Anomalies

```typescript
// ✅ Good: Detect statistical anomalies
class AnomalyDetector {
  detectAnomalies(trace: Trace, baseline: TraceMetrics): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const metrics = this.analyzer.analyze(trace);

    // Check for duration anomalies
    if (metrics.totalDuration > baseline.totalDuration * 2) {
      anomalies.push({
        type: 'duration_spike',
        severity: 'high',
        message: `Trace duration (${metrics.totalDuration}ms) is more than 2x baseline (${baseline.totalDuration}ms)`,
        metrics: { actual: metrics.totalDuration, expected: baseline.totalDuration },
      });
    }

    // Check for error rate anomalies
    if (metrics.errorRate > baseline.errorRate + 0.1) {
      anomalies.push({
        type: 'error_rate_increase',
        severity: 'critical',
        message: `Error rate (${(metrics.errorRate * 100).toFixed(1)}%) increased from baseline (${(baseline.errorRate * 100).toFixed(1)}%)`,
        metrics: { actual: metrics.errorRate, expected: baseline.errorRate },
      });
    }

    return anomalies;
  }
}
```

#### Pattern-Based Anomalies

```typescript
// ✅ Good: Detect behavioral anomalies
class BehavioralAnomalyDetector {
  detectBehavioralAnomalies(trace: Trace): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Detect excessive tool calls
    const toolCallsPerStep = this.countToolCallsPerStep(trace);
    if (Math.max(...toolCallsPerStep) > 10) {
      anomalies.push({
        type: 'excessive_tool_calls',
        severity: 'medium',
        message: 'Agent made more than 10 tool calls in a single step',
        context: this.findStepWithMostToolCalls(trace),
      });
    }

    // Detect long thinking times
    const thinkingTimes = this.extractThinkingTimes(trace);
    const longThinkingSteps = thinkingTimes.filter(t => t > 30000);
    if (longThinkingSteps.length > 0) {
      anomalies.push({
        type: 'long_thinking_time',
        severity: 'low',
        message: `${longThinkingSteps.length} steps had thinking times over 30 seconds`,
        context: longThinkingSteps,
      });
    }

    return anomalies;
  }
}
```

## Debugging Workflows

### 1. Error Investigation

#### Error Chain Analysis

```typescript
// ✅ Good: Trace error propagation
class ErrorChainAnalyzer {
  analyzeErrorChain(trace: Trace, errorSpanId: string): ErrorChain {
    const errorSpan = trace.spans.find(s => s.id === errorSpanId);
    if (!errorSpan) throw new Error('Error span not found');

    // Trace back to root cause
    const chain: Span[] = [errorSpan];
    let currentSpan = errorSpan;

    while (currentSpan.parentId) {
      const parent = trace.spans.find(s => s.id === currentSpan.parentId);
      if (!parent) break;

      chain.unshift(parent); // Add to beginning
      currentSpan = parent;
    }

    return {
      rootCause: chain[0],
      errorSpan: errorSpan,
      chain,
      contributingFactors: this.identifyContributingFactors(chain),
    };
  }
}
```

#### Context Reconstruction

```typescript
// ✅ Good: Reconstruct execution context
class ContextReconstructor {
  reconstructContext(trace: Trace, targetSpanId: string): ExecutionContext {
    const targetSpan = trace.spans.find(s => s.id === targetSpanId);
    if (!targetSpan) throw new Error('Span not found');

    // Find checkpoint before target span
    const checkpoint = this.findNearestCheckpoint(trace, targetSpan.startTime);

    // Reconstruct state from checkpoint
    const state = checkpoint ? checkpoint.state : this.reconstructFromSpans(trace, targetSpan);

    return {
      state,
      variables: this.extractVariables(trace, targetSpan),
      conversation: this.extractConversation(trace, targetSpan),
      environment: trace.metadata.environment,
    };
  }
}
```

### 2. Performance Investigation

#### Bottleneck Identification

```typescript
// ✅ Good: Identify performance bottlenecks
class BottleneckAnalyzer {
  identifyBottlenecks(trace: Trace): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];

    // Find spans with longest durations
    const slowestSpans = trace.spans
      .filter(s => s.endTime)
      .sort((a, b) => b.endTime! - b.startTime - (a.endTime! - a.startTime))
      .slice(0, 10);

    slowestSpans.forEach(span => {
      const duration = span.endTime! - span.startTime;
      const percentage = (duration / trace.metadata.summary.duration) * 100;

      if (percentage > 20) {
        // More than 20% of total time
        bottlenecks.push({
          span,
          duration,
          percentage,
          type: this.classifyBottleneck(span),
          recommendations: this.generateRecommendations(span),
        });
      }
    });

    return bottlenecks;
  }
}
```

#### Concurrency Analysis

```typescript
// ✅ Good: Analyze concurrent execution
class ConcurrencyAnalyzer {
  analyzeConcurrency(trace: Trace): ConcurrencyReport {
    const timeline = this.buildTimeline(trace.spans);
    const concurrentGroups = this.findConcurrentGroups(timeline);

    return {
      maxConcurrency: Math.max(...concurrentGroups.map(g => g.spans.length)),
      avgConcurrency: this.average(concurrentGroups.map(g => g.spans.length)),
      concurrentGroups,
      idleTime: this.calculateIdleTime(timeline, concurrentGroups),
      utilization: this.calculateUtilization(timeline, concurrentGroups),
    };
  }
}
```

## Reporting and Visualization

### Trace Summary Report

```typescript
// ✅ Good: Generate comprehensive reports
class TraceReportGenerator {
  generateReport(trace: Trace): TraceReport {
    return {
      overview: {
        id: trace.metadata.id,
        name: trace.metadata.name,
        duration: trace.metadata.summary.duration,
        spanCount: trace.spans.length,
        errorCount: this.countErrors(trace),
        timestamp: new Date(trace.metadata.createdAt).toISOString(),
      },
      metrics: this.analyzer.analyze(trace),
      anomalies: this.anomalyDetector.detectAnomalies(trace),
      bottlenecks: this.bottleneckAnalyzer.identifyBottlenecks(trace),
      recommendations: this.generateRecommendations(trace),
      timeline: this.visualizer.render(trace),
    };
  }
}
```

### Interactive Dashboard

```typescript
// ✅ Good: Create interactive analysis dashboards
class TraceDashboard {
  createDashboard(trace: Trace): Dashboard {
    return {
      sections: [
        {
          title: 'Overview',
          widgets: [
            { type: 'metric', label: 'Duration', value: trace.metadata.summary.duration },
            { type: 'metric', label: 'Spans', value: trace.spans.length },
            { type: 'metric', label: 'Errors', value: this.countErrors(trace) },
            { type: 'metric', label: 'Checkpoints', value: trace.checkpoints.length },
          ],
        },
        {
          title: 'Timeline',
          widgets: [{ type: 'timeline', data: this.visualizer.render(trace) }],
        },
        {
          title: 'Performance',
          widgets: [
            { type: 'chart', chartType: 'histogram', data: this.getDurationDistribution(trace) },
            { type: 'table', data: this.getSlowestSpans(trace) },
          ],
        },
        {
          title: 'Issues',
          widgets: [{ type: 'list', items: this.detectAnomalies(trace) }],
        },
      ],
    };
  }
}
```

## Best Practices

### 1. Systematic Approach

- Start with high-level overview
- Drill down into specific areas
- Correlate multiple metrics
- Validate hypotheses with data

### 2. Documentation

- Document findings and insights
- Create reproducible analysis scripts
- Share knowledge with team
- Build analysis playbooks

### 3. Tool Development

- Automate repetitive analysis tasks
- Build reusable analysis components
- Create analysis templates
- Integrate with debugging tools

## Resources

### Documentation

- [OpenTelemetry Trace Analysis](https://opentelemetry.io/docs/concepts/signals/traces/)
- [Distributed Tracing Best Practices](https://github.com/open-telemetry/opentelemetry-specification)
- [Performance Analysis Methodologies](https://www.perfmon.io/)

### Tools

- Jaeger - Distributed tracing system
- Zipkin - Distributed tracing system
- Grafana Tempo - Trace backend
- OpenTelemetry - Observability framework

---

**Maintained by**: @reaatech and contributors  
**Last Updated**: 2026-04-22
