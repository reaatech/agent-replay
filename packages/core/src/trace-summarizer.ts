import type { Trace, Span, Event } from '@reaatech/shared';

export interface TraceSummaryReport {
  /** High-level description of what the trace does */
  description: string;
  /** Key statistics */
  stats: SummaryStats;
  /** Key events that stand out */
  highlights: Highlight[];
  /** Suggested areas of concern */
  concerns: string[];
}

export interface SummaryStats {
  spanCount: number;
  llmCallCount: number;
  toolCallCount: number;
  errorCount: number;
  totalTokens?: number;
  averageResponseLength: number;
}

export interface Highlight {
  step: number;
  spanName: string;
  description: string;
  importance: 'low' | 'medium' | 'high';
}

/**
 * Automatically summarizes a trace into a human-readable report.
 * Useful for quickly understanding what happened in a long trace
 * without reading every span.
 */
export class TraceSummarizer {
  summarize(trace: Trace): TraceSummaryReport {
    const stats = this.computeStats(trace);
    const highlights = this.extractHighlights(trace);
    const concerns = this.identifyConcerns(trace, stats);
    const description = this.generateDescription(trace, stats);

    return {
      description,
      stats,
      highlights,
      concerns,
    };
  }

  private computeStats(trace: Trace): SummaryStats {
    const llmCalls = trace.spans.filter(s => s.kind === 'llm_call');
    const toolCalls = trace.spans.filter(s => s.kind === 'tool_call');
    const errors = trace.spans.filter(s => s.status === 'error');

    let totalTokens = 0;
    let totalResponseLength = 0;
    let responseCount = 0;

    for (const span of llmCalls) {
      const response = this.getResponseEvent(span);
      if (response?.data && typeof response.data === 'object') {
        const data = response.data as { usage?: { total?: number }; content?: string };
        if (data.usage?.total) {
          totalTokens += data.usage.total;
        }
        if (typeof data.content === 'string') {
          totalResponseLength += data.content.length;
          responseCount++;
        }
      }
    }

    return {
      spanCount: trace.spans.length,
      llmCallCount: llmCalls.length,
      toolCallCount: toolCalls.length,
      errorCount: errors.length,
      totalTokens: totalTokens > 0 ? totalTokens : undefined,
      averageResponseLength:
        responseCount > 0 ? Math.round(totalResponseLength / responseCount) : 0,
    };
  }

  private extractHighlights(trace: Trace): Highlight[] {
    const highlights: Highlight[] = [];

    for (let i = 0; i < trace.spans.length; i++) {
      const span = trace.spans[i];

      // Highlight errors
      if (span.status === 'error') {
        highlights.push({
          step: i,
          spanName: span.name,
          description: `Error in ${span.kind}: ${String(span.events.find(e => e.type === 'error')?.data ?? 'unknown error')}`,
          importance: 'high',
        });
        continue;
      }

      // Highlight tool calls with unusual names
      if (span.kind === 'tool_call') {
        const req = span.events.find(e => e.type === 'request');
        const toolName =
          req && typeof req.data === 'object' ? (req.data as { name?: string }).name : undefined;
        highlights.push({
          step: i,
          spanName: span.name,
          description: `Tool execution: ${toolName ?? span.name}`,
          importance: 'medium',
        });
      }

      // Highlight LLM calls with tool calls in response
      if (span.kind === 'llm_call') {
        const resp = this.getResponseEvent(span);
        const data = resp?.data as { toolCalls?: unknown[] } | undefined;
        if (data?.toolCalls && data.toolCalls.length > 0) {
          highlights.push({
            step: i,
            spanName: span.name,
            description: `LLM requested ${data.toolCalls.length} tool call(s)`,
            importance: 'medium',
          });
        }
      }
    }

    return highlights;
  }

  private identifyConcerns(trace: Trace, stats: SummaryStats): string[] {
    const concerns: string[] = [];

    if (stats.errorCount > 0) {
      concerns.push(`${stats.errorCount} error(s) detected during execution`);
    }

    if (stats.llmCallCount > 10) {
      concerns.push('High number of LLM calls may indicate excessive token usage');
    }

    if (stats.toolCallCount > stats.llmCallCount * 2) {
      concerns.push('Unusual ratio of tool calls to LLM calls');
    }

    const slowSpans = trace.spans.filter(s => {
      const duration = (s.endTime ?? s.startTime) - s.startTime;
      return duration > 5000;
    });
    if (slowSpans.length > 0) {
      concerns.push(`${slowSpans.length} span(s) took longer than 5 seconds`);
    }

    return concerns;
  }

  private generateDescription(trace: Trace, stats: SummaryStats): string {
    const parts: string[] = [];
    parts.push(`Agent trace "${trace.metadata.name}" with ${stats.spanCount} spans`);
    parts.push(`(${stats.llmCallCount} LLM calls, ${stats.toolCallCount} tool calls)`);

    if (stats.errorCount > 0) {
      parts.push(`completed with ${stats.errorCount} error(s).`);
    } else {
      parts.push('completed successfully.');
    }

    return parts.join(' ');
  }

  private getResponseEvent(span: Span): Event | undefined {
    return span.events.find(e => e.type === 'response');
  }
}

/**
 * Format a trace summary into a human-readable report.
 */
export function formatSummary(summary: TraceSummaryReport): string {
  const lines = [
    `Trace Summary`,
    `  ${summary.description}`,
    '',
    `Statistics:`,
    `  Spans: ${summary.stats.spanCount}`,
    `  LLM calls: ${summary.stats.llmCallCount}`,
    `  Tool calls: ${summary.stats.toolCallCount}`,
    `  Errors: ${summary.stats.errorCount}`,
    `  Avg response length: ${summary.stats.averageResponseLength} chars`,
  ];

  if (summary.stats.totalTokens !== undefined) {
    lines.push(`  Total tokens: ${summary.stats.totalTokens}`);
  }

  if (summary.highlights.length > 0) {
    lines.push('', 'Highlights:');
    for (const h of summary.highlights) {
      lines.push(`  [${h.importance.toUpperCase()}] Step ${h.step}: ${h.description}`);
    }
  }

  if (summary.concerns.length > 0) {
    lines.push('', 'Concerns:');
    for (const c of summary.concerns) {
      lines.push(`  ⚠️  ${c}`);
    }
  }

  return lines.join('\n');
}
