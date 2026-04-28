# Diff Analysis Skill

## Overview

The Diff Analysis skill focuses on comparing agent behaviors across different runs, versions, or configurations to identify meaningful differences, detect regressions, and understand behavioral changes. This skill is essential for validating agent improvements and detecting unintended side effects.

## Core Principles

### 1. Multi-Dimensional Comparison

- Structural differences (trace structure, span count, timing)
- Semantic differences (LLM outputs, tool results, decisions)
- Statistical differences (performance metrics, error rates)
- Behavioral differences (routing choices, tool usage patterns)

### 2. Contextual Understanding

- Distinguish meaningful vs. trivial changes
- Consider domain-specific significance
- Account for inherent LLM variability
- Prioritize user-impacting differences

### 3. Actionable Insights

- Clear difference visualization
- Root cause identification
- Impact assessment
- Recommendations for action

## Diff Types

### 1. Structural Diff

```typescript
// ✅ Good: Compare trace structures
class StructuralDiffAnalyzer {
  compare(trace1: Trace, trace2: Trace): StructuralDiff {
    const differences: StructuralDifference[] = [];

    // Compare span counts
    const spanCountDiff = trace1.spans.length - trace2.spans.length;
    if (spanCountDiff !== 0) {
      differences.push({
        type: 'span_count',
        severity: spanCountDiff > 5 ? 'high' : 'medium',
        message: `Span count changed: ${trace1.spans.length} → ${trace2.spans.length}`,
        details: { before: trace1.spans.length, after: trace2.spans.length },
      });
    }

    // Compare span kinds distribution
    const kindDistribution1 = this.getKindDistribution(trace1.spans);
    const kindDistribution2 = this.getKindDistribution(trace2.spans);
    const kindDiffs = this.compareDistributions(kindDistribution1, kindDistribution2);
    differences.push(...kindDiffs);

    // Compare checkpoint counts
    if (trace1.checkpoints.length !== trace2.checkpoints.length) {
      differences.push({
        type: 'checkpoint_count',
        severity: 'low',
        message: `Checkpoint count changed: ${trace1.checkpoints.length} → ${trace2.checkpoints.length}`,
        details: { before: trace1.checkpoints.length, after: trace2.checkpoints.length },
      });
    }

    // Compare error counts
    const errorCount1 = trace1.spans.filter(s => s.status === 'error').length;
    const errorCount2 = trace2.spans.filter(s => s.status === 'error').length;
    if (errorCount1 !== errorCount2) {
      differences.push({
        type: 'error_count',
        severity: 'high',
        message: `Error count changed: ${errorCount1} → ${errorCount2}`,
        details: { before: errorCount1, after: errorCount2 },
      });
    }

    return {
      differences,
      summary: this.summarizeStructuralChanges(differences),
    };
  }
}
```

### 2. Semantic Diff

```typescript
// ✅ Good: Compare semantic content
class SemanticDiffAnalyzer {
  async compare(trace1: Trace, trace2: Trace): Promise<SemanticDiff> {
    const differences: SemanticDifference[] = [];

    // Compare LLM outputs
    const llmOutputs1 = this.extractLLMOutputs(trace1.spans);
    const llmOutputs2 = this.extractLLMOutputs(trace2.spans);
    const outputDiffs = await this.compareLLMOutputs(llmOutputs1, llmOutputs2);
    differences.push(...outputDiffs);

    // Compare tool call sequences
    const toolCalls1 = this.extractToolCalls(trace1.spans);
    const toolCalls2 = this.extractToolCalls(trace2.spans);
    const toolCallDiffs = this.compareToolCalls(toolCalls1, toolCalls2);
    differences.push(...toolCallDiffs);

    // Compare routing decisions
    const routes1 = this.extractRoutingDecisions(trace1.spans);
    const routes2 = this.extractRoutingDecisions(trace2.spans);
    const routeDiffs = this.compareRoutes(routes1, routes2);
    differences.push(...routeDiffs);

    return {
      differences,
      summary: this.summarizeSemanticChanges(differences),
    };
  }

  private async compareLLMOutputs(
    outputs1: LLMOutput[],
    outputs2: LLMOutput[]
  ): Promise<SemanticDifference[]> {
    const differences: SemanticDifference[] = [];

    for (let i = 0; i < Math.min(outputs1.length, outputs2.length); i++) {
      const similarity = await this.calculateSemanticSimilarity(
        outputs1[i].content,
        outputs2[i].content
      );

      if (similarity < 0.95) {
        // Threshold for meaningful difference
        differences.push({
          type: 'llm_output_change',
          severity: similarity < 0.8 ? 'high' : 'medium',
          message: `LLM output ${i + 1} changed (similarity: ${(similarity * 100).toFixed(1)}%)`,
          details: {
            before: outputs1[i].content,
            after: outputs2[i].content,
            similarity,
          },
        });
      }
    }

    return differences;
  }
}
```

### 3. Statistical Diff

```typescript
// ✅ Good: Compare statistical metrics
class StatisticalDiffAnalyzer {
  compare(metrics1: TraceMetrics, metrics2: TraceMetrics): StatisticalDiff {
    const differences: StatisticalDifference[] = [];

    // Compare durations
    const durationChange = this.calculatePercentageChange(
      metrics1.totalDuration,
      metrics2.totalDuration
    );
    if (Math.abs(durationChange) > 10) {
      // >10% change
      differences.push({
        type: 'duration_change',
        severity: Math.abs(durationChange) > 50 ? 'high' : 'medium',
        message: `Total duration changed by ${durationChange.toFixed(1)}%`,
        details: {
          before: metrics1.totalDuration,
          after: metrics2.totalDuration,
          change: durationChange,
        },
      });
    }

    // Compare error rates
    const errorRateChange = metrics2.errorRate - metrics1.errorRate;
    if (Math.abs(errorRateChange) > 0.05) {
      // >5% change
      differences.push({
        type: 'error_rate_change',
        severity: errorRateChange > 0 ? 'high' : 'low',
        message: `Error rate changed by ${(errorRateChange * 100).toFixed(1)}%`,
        details: {
          before: metrics1.errorRate,
          after: metrics2.errorRate,
          change: errorRateChange,
        },
      });
    }

    // Compare LLM call patterns
    const llmCallChange = this.calculatePercentageChange(
      metrics1.llmCallCount,
      metrics2.llmCallCount
    );
    if (Math.abs(llmCallChange) > 20) {
      // >20% change
      differences.push({
        type: 'llm_call_count_change',
        severity: 'medium',
        message: `LLM call count changed by ${llmCallChange.toFixed(1)}%`,
        details: {
          before: metrics1.llmCallCount,
          after: metrics2.llmCallCount,
          change: llmCallChange,
        },
      });
    }

    return {
      differences,
      summary: this.summarizeStatisticalChanges(differences),
    };
  }
}
```

## Diff Workflows

### 1. Version Comparison

```typescript
// ✅ Good: Compare agent versions
class VersionComparator {
  async compareVersions(
    version1: string,
    version2: string,
    testScenarios: TestScenario[]
  ): Promise<VersionDiffReport> {
    const comparisons: VersionComparison[] = [];

    for (const scenario of testScenarios) {
      // Run scenario with version 1
      const trace1 = await this.runScenario(scenario, version1);

      // Run scenario with version 2
      const trace2 = await this.runScenario(scenario, version2);

      // Compare traces
      const diff = await this.diffEngine.compare(trace1, trace2);

      comparisons.push({
        scenario,
        trace1: trace1.metadata.id,
        trace2: trace2.metadata.id,
        diff,
      });
    }

    return {
      version1,
      version2,
      comparisons,
      summary: this.summarizeVersionChanges(comparisons),
      recommendations: this.generateVersionRecommendations(comparisons),
    };
  }
}
```

### 2. Configuration Comparison

```typescript
// ✅ Good: Compare different configurations
class ConfigurationComparator {
  async compareConfigurations(
    config1: AgentConfig,
    config2: AgentConfig,
    testScenarios: TestScenario[]
  ): Promise<ConfigDiffReport> {
    const differences: ConfigDifference[] = [];

    // Compare configuration values
    const configDiffs = this.diffConfigs(config1, config2);
    differences.push(...configDiffs);

    // Compare behavioral impacts
    const behavioralDiffs = await this.compareBehavioralImpacts(config1, config2, testScenarios);
    differences.push(...behavioralDiffs);

    return {
      config1,
      config2,
      differences,
      summary: this.summarizeConfigChanges(differences),
      recommendations: this.generateConfigRecommendations(differences),
    };
  }
}
```

### 3. Regression Detection

```typescript
// ✅ Good: Detect regressions
class RegressionDetector {
  async detectRegressions(
    baselineTrace: Trace,
    currentTrace: Trace,
    thresholds: RegressionThresholds
  ): Promise<RegressionReport> {
    const regressions: Regression[] = [];

    // Check for new errors
    const newErrors = this.detectNewErrors(baselineTrace, currentTrace);
    if (newErrors.length > 0) {
      regressions.push({
        type: 'new_errors',
        severity: 'critical',
        message: `${newErrors.length} new errors detected`,
        details: { errors: newErrors },
      });
    }

    // Check for performance degradation
    const performanceRegression = this.detectPerformanceRegression(
      baselineTrace,
      currentTrace,
      thresholds.performance
    );
    if (performanceRegression) {
      regressions.push(performanceRegression);
    }

    // Check for behavioral changes
    const behavioralRegression = await this.detectBehavioralRegression(
      baselineTrace,
      currentTrace,
      thresholds.behavioral
    );
    if (behavioralRegression) {
      regressions.push(behavioralRegression);
    }

    return {
      baseline: baselineTrace.metadata.id,
      current: currentTrace.metadata.id,
      regressions,
      severity: this.calculateOverallSeverity(regressions),
      recommendations: this.generateRegressionRecommendations(regressions),
    };
  }
}
```

## Advanced Analysis

### 1. Root Cause Analysis

```typescript
// ✅ Good: Identify root causes of differences
class RootCauseAnalyzer {
  async analyzeRootCause(diff: TraceDiff, context: AnalysisContext): Promise<RootCauseAnalysis> {
    const potentialCauses: PotentialCause[] = [];

    // Analyze structural changes
    const structuralCauses = await this.analyzeStructuralCauses(diff.structural);
    potentialCauses.push(...structuralCauses);

    // Analyze semantic changes
    const semanticCauses = await this.analyzeSemanticCauses(diff.semantic);
    potentialCauses.push(...semanticCauses);

    // Analyze statistical changes
    const statisticalCauses = this.analyzeStatisticalCauses(diff.statistical);
    potentialCauses.push(...statisticalCauses);

    // Rank causes by likelihood
    const rankedCauses = await this.rankCauses(potentialCauses, context);

    return {
      mostLikelyCause: rankedCauses[0],
      allCauses: rankedCauses,
      confidence: this.calculateConfidence(rankedCauses),
      investigationSteps: this.generateInvestigationSteps(rankedCauses),
    };
  }
}
```

### 2. Impact Assessment

```typescript
// ✅ Good: Assess impact of differences
class ImpactAssessor {
  async assessImpact(diff: TraceDiff, userContext: UserContext): Promise<ImpactAssessment> {
    const impacts: Impact[] = [];

    // Assess user-facing impacts
    const userImpacts = await this.assessUserImpact(diff, userContext);
    impacts.push(...userImpacts);

    // Assess performance impacts
    const performanceImpacts = this.assessPerformanceImpact(diff);
    impacts.push(...performanceImpacts);

    // Assess cost impacts
    const costImpacts = this.assessCostImpact(diff);
    impacts.push(...costImpacts);

    // Calculate overall impact score
    const overallScore = this.calculateImpactScore(impacts);

    return {
      impacts,
      overallScore,
      severity: this.scoreToSeverity(overallScore),
      recommendations: this.generateImpactRecommendations(impacts),
    };
  }
}
```

## Visualization

### 1. Side-by-Side Comparison

```typescript
// ✅ Good: Visual side-by-side comparison
class SideBySideVisualizer {
  createComparisonView(diff: TraceDiff): ComparisonView {
    return {
      layout: 'side-by-side',
      sections: [
        {
          title: 'Overview',
          metrics: [
            { label: 'Duration', before: diff.before.duration, after: diff.after.duration },
            { label: 'Spans', before: diff.before.spanCount, after: diff.after.spanCount },
            { label: 'Errors', before: diff.before.errorCount, after: diff.after.errorCount },
          ],
        },
        {
          title: 'Timeline Comparison',
          type: 'timeline-comparison',
          data: {
            before: this.createTimelineView(diff.before.trace),
            after: this.createTimelineView(diff.after.trace),
          },
        },
        {
          title: 'Differences',
          type: 'diff-list',
          data: diff.differences.map(d => ({
            severity: d.severity,
            message: d.message,
            details: d.details,
          })),
        },
      ],
    };
  }
}
```

### 2. Heat Map Visualization

```typescript
// ✅ Good: Heat map for difference intensity
class HeatMapVisualizer {
  createHeatMap(diff: TraceDiff): HeatMapView {
    const spans = this.alignSpans(diff.before.spans, diff.after.spans);

    const heatMap = spans.map((spanPair, index) => {
      const differenceScore = this.calculateSpanDifferenceScore(spanPair);
      return {
        index,
        spanId: spanPair.before?.id || spanPair.after?.id || `span-${index}`,
        score: differenceScore,
        severity: this.scoreToSeverity(differenceScore),
      };
    });

    return {
      type: 'heat-map',
      data: heatMap,
      legend: {
        low: '0-25%',
        medium: '25-50%',
        high: '50-75%',
        critical: '75-100%',
      },
    };
  }
}
```

## Best Practices

### 1. Meaningful Comparison

- Focus on user-impacting differences
- Filter out trivial variations
- Consider domain context
- Prioritize actionable insights

### 2. Statistical Rigor

- Use appropriate statistical tests
- Account for LLM variability
- Set meaningful thresholds
- Validate findings with multiple runs

### 3. Clear Communication

- Use clear, non-technical language
- Provide concrete examples
- Include visual representations
- Offer actionable recommendations

## Resources

### Documentation

- [Diff Analysis Guide](https://docs.agent-replay.dev/diff-analysis)
- [Regression Detection](https://docs.agent-replay.dev/regression-detection)
- [Impact Assessment](https://docs.agent-replay.dev/impact-assessment)

### Tools

- Diff Engine - Core comparison engine
- Visualization Tools - Charts and graphs
- Statistical Analysis - Statistical testing
- Report Generator - Automated reporting

---

**Maintained by**: @reaatech and contributors  
**Last Updated**: 2026-04-22
