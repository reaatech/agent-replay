import type { Event, Trace } from '@reaatech/agent-replay-shared';

/** An annotation attached to a specific point in a trace. */
export interface TraceAnnotation {
  id: string;
  /** Target span ID */
  spanId: string;
  /** Optional event name within the span */
  eventName?: string;
  /** Annotation content */
  content: string;
  /** Author or source of the annotation */
  author: string;
  /** Timestamp when the annotation was created */
  createdAt: number;
  /** Optional severity/importance level */
  severity?: 'info' | 'warning' | 'critical';
  /** Tags for categorization */
  tags: string[];
}

/** Query filter for searching annotations. */
export interface AnnotationQuery {
  spanId?: string;
  author?: string;
  severity?: TraceAnnotation['severity'];
  tags?: string[];
  contentContains?: string;
}

/**
 * AnnotationManager provides CRUD operations for trace annotations,
 * enabling collaboration and post-hoc analysis of traces.
 */
export class AnnotationManager {
  private idCounter = 0;
  private annotations: TraceAnnotation[] = [];

  /** Add a new annotation. */
  add(annotation: Omit<TraceAnnotation, 'id' | 'createdAt'>): TraceAnnotation {
    const entry: TraceAnnotation = {
      ...annotation,
      id: `ann-${++this.idCounter}`,
      createdAt: Date.now(),
    };
    this.annotations.push(entry);
    return entry;
  }

  /** Remove an annotation by ID. */
  remove(id: string): boolean {
    const idx = this.annotations.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    this.annotations.splice(idx, 1);
    return true;
  }

  /** Update an annotation's content. */
  update(
    id: string,
    updates: Partial<Pick<TraceAnnotation, 'content' | 'severity' | 'tags'>>,
  ): TraceAnnotation | null {
    const ann = this.annotations.find((a) => a.id === id);
    if (!ann) return null;
    if (updates.content !== undefined) ann.content = updates.content;
    if (updates.severity !== undefined) ann.severity = updates.severity;
    if (updates.tags !== undefined) ann.tags = updates.tags;
    return ann;
  }

  /** Get a single annotation by ID. */
  get(id: string): TraceAnnotation | undefined {
    return this.annotations.find((a) => a.id === id);
  }

  /** List all annotations, optionally filtered. */
  list(query?: AnnotationQuery): TraceAnnotation[] {
    let result = [...this.annotations];
    if (!query) return result;

    if (query.spanId) {
      result = result.filter((a) => a.spanId === query.spanId);
    }
    if (query.author) {
      result = result.filter((a) => a.author === query.author);
    }
    if (query.severity) {
      result = result.filter((a) => a.severity === query.severity);
    }
    if (query.tags && query.tags.length > 0) {
      result = result.filter((a) => query.tags?.some((t) => a.tags.includes(t)));
    }
    if (query.contentContains) {
      const search = query.contentContains.toLowerCase();
      result = result.filter((a) => a.content.toLowerCase().includes(search));
    }

    return result;
  }

  /** Get all annotations for a specific span. */
  getForSpan(spanId: string): TraceAnnotation[] {
    return this.annotations.filter((a) => a.spanId === spanId);
  }

  /** Count annotations by severity. */
  countBySeverity(): Record<string, number> {
    const counts: Record<string, number> = { info: 0, warning: 0, critical: 0, none: 0 };
    for (const ann of this.annotations) {
      counts[ann.severity ?? 'none']++;
    }
    return counts;
  }

  /** Serialize annotations to events that can be embedded in a trace. */
  toEvents(): Event[] {
    return this.annotations.map((ann) => ({
      timestamp: ann.createdAt,
      type: 'annotation' as const,
      name: ann.id,
      attributes: {
        author: ann.author,
        severity: ann.severity,
        tags: ann.tags,
      },
      data: {
        spanId: ann.spanId,
        eventName: ann.eventName,
        content: ann.content,
      },
    }));
  }

  /** Load annotations from a trace's annotation events. */
  loadFromTrace(trace: Trace): void {
    this.annotations = [];
    for (const span of trace.spans) {
      for (const event of span.events) {
        if (event.type === 'annotation') {
          const data = event.data as
            | { spanId: string; eventName?: string; content: string }
            | undefined;
          if (data) {
            this.annotations.push({
              id: event.name,
              spanId: data.spanId,
              eventName: data.eventName,
              content: data.content,
              author:
                typeof event.attributes.author === 'string' ? event.attributes.author : 'unknown',
              createdAt: event.timestamp,
              severity: (['info', 'warning', 'critical'] as const).includes(
                event.attributes.severity as 'info' | 'warning' | 'critical',
              )
                ? (event.attributes.severity as TraceAnnotation['severity'])
                : undefined,
              tags: Array.isArray(event.attributes.tags) ? (event.attributes.tags as string[]) : [],
            });
          }
        }
      }
    }
  }

  /** Clear all annotations. */
  clear(): void {
    this.annotations = [];
  }
}

/**
 * Format annotations into a human-readable report.
 */
export function formatAnnotations(annotations: TraceAnnotation[]): string {
  if (annotations.length === 0) return 'No annotations.';

  const lines = [`Annotations (${annotations.length}):`, ''];
  for (const ann of annotations) {
    const severityTag = ann.severity ? `[${ann.severity.toUpperCase()}] ` : '';
    lines.push(
      `${severityTag}#${ann.id} by ${ann.author} @ ${new Date(ann.createdAt).toISOString()}`,
    );
    lines.push(`  Span: ${ann.spanId}${ann.eventName ? ` / Event: ${ann.eventName}` : ''}`);
    lines.push(`  ${ann.content}`);
    if (ann.tags.length > 0) {
      lines.push(`  Tags: ${ann.tags.join(', ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
