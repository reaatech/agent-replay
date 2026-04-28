# Performance Optimization Skill

## Overview

The Performance Optimization skill focuses on identifying and eliminating bottlenecks in the Agent Replay system, ensuring efficient resource usage, fast execution, and scalability.

## Core Principles

### 1. Measure First

- Profile before optimizing
- Use data-driven decisions
- Benchmark critical paths
- Monitor in production

### 2. Focus on Hot Paths

- Optimize frequently executed code
- Prioritize user-facing operations
- Consider algorithmic complexity
- Minimize I/O operations

### 3. Balance Trade-offs

- Memory vs. CPU usage
- Latency vs. throughput
- Complexity vs. performance
- Optimization vs. maintainability

## Profiling and Measurement

### Performance Monitoring

```typescript
// ✅ Good: Performance instrumentation
class PerformanceMonitor {
  private metrics = new Map<string, Metric>();

  startTimer(name: string): Timer {
    const start = performance.now();
    return {
      stop: () => {
        const duration = performance.now() - start;
        this.recordMetric(name, duration);
      },
    };
  }

  private recordMetric(name: string, value: number) {
    const metric = this.metrics.get(name) || { count: 0, total: 0, min: Infinity, max: 0 };
    metric.count++;
    metric.total += value;
    metric.min = Math.min(metric.min, value);
    metric.max = Math.max(metric.max, value);
    this.metrics.set(name, metric);
  }

  getReport(): PerformanceReport {
    const report: PerformanceReport = {};
    this.metrics.forEach((metric, name) => {
      report[name] = {
        count: metric.count,
        avg: metric.total / metric.count,
        min: metric.min,
        max: metric.max,
      };
    });
    return report;
  }
}

// Usage
const monitor = new PerformanceMonitor();
const timer = monitor.startTimer('trace-processing');
await processTrace(trace);
timer.stop();
console.log(monitor.getReport());
```

### Memory Profiling

```typescript
// ✅ Good: Memory usage tracking
class MemoryTracker {
  trackMemoryUsage(label: string, fn: () => void) {
    const startMem = process.memoryUsage();
    fn();
    const endMem = process.memoryUsage();

    console.log(`${label}:`);
    console.log(`  Heap used: ${formatBytes(endMem.heapUsed - startMem.heapUsed)}`);
    console.log(`  RSS: ${formatBytes(endMem.rss - startMem.rss)}`);
  }
}
```

## Optimization Techniques

### 1. Trace Processing Optimization

#### Streaming Processing

```typescript
// ✅ Good: Stream large traces
class StreamingTraceProcessor {
  async *processInChunks(trace: Trace, chunkSize: number = 1000) {
    for (let i = 0; i < trace.spans.length; i += chunkSize) {
      const chunk = trace.spans.slice(i, i + chunkSize);
      yield await this.processChunk(chunk);

      // Allow garbage collection
      if (i % (chunkSize * 10) === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }
}
```

#### Parallel Processing

```typescript
// ✅ Good: Parallel span processing
class ParallelTraceProcessor {
  async processParallel(trace: Trace, concurrency: number = 4) {
    const chunks = this.distributeSpans(trace.spans, concurrency);
    const results = await Promise.allSettled(chunks.map(chunk => this.processChunk(chunk)));

    return this.mergeResults(results);
  }

  private distributeSpans(spans: Span[], buckets: number): Span[][] {
    const result: Span[][] = Array.from({ length: buckets }, () => []);
    spans.forEach((span, i) => {
      result[i % buckets].push(span);
    });
    return result;
  }
}
```

### 2. Storage Optimization

#### Compression

```typescript
// ✅ Good: Efficient trace compression
class TraceCompressor {
  async compress(trace: Trace): Promise<Buffer> {
    const json = JSON.stringify(trace);
    const compressed = await this.compressData(json);
    return compressed;
  }

  async decompress(buffer: Buffer): Promise<Trace> {
    const json = await this.decompressData(buffer);
    return JSON.parse(json) as Trace;
  }

  private async compressData(data: string): Promise<Buffer> {
    return promisify(zlib.gzip)(Buffer.from(data));
  }

  private async decompressData(buffer: Buffer): Promise<string> {
    return promisify(zlib.gunzip)(buffer).then(b => b.toString());
  }
}
```

#### Indexing

```typescript
// ✅ Good: Efficient trace indexing
class TraceIndex {
  private byId = new Map<string, Span>();
  private byKind = new Map<SpanKind, Set<string>>();
  private byTime = new SortedMap<number, string[]>();

  indexTrace(trace: Trace) {
    trace.spans.forEach(span => {
      this.byId.set(span.id, span);

      if (!this.byKind.has(span.kind)) {
        this.byKind.set(span.kind, new Set());
      }
      this.byKind.get(span.kind)!.add(span.id);

      this.byTime.set(span.startTime, span.id);
    });
  }

  findByKind(kind: SpanKind): Span[] {
    const ids = this.byKind.get(kind);
    return ids ? Array.from(ids).map(id => this.byId.get(id)!) : [];
  }

  findInTimeRange(start: number, end: number): Span[] {
    const ids = this.byTime.range(start, end);
    return ids.map(id => this.byId.get(id)!);
  }
}
```

### 3. Memory Optimization

#### Object Pooling

```typescript
// ✅ Good: Reuse objects to reduce GC pressure
class SpanPool {
  private pool: Span[] = [];
  private size = 0;

  acquire(): Span {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createSpan();
  }

  release(span: Span) {
    this.resetSpan(span);
    this.pool.push(span);
  }

  private createSpan(): Span {
    return {
      id: '',
      name: '',
      kind: 'agent_step',
      startTime: 0,
      status: 'ok',
      events: [],
      attributes: {},
    };
  }

  private resetSpan(span: Span) {
    span.id = '';
    span.name = '';
    span.startTime = 0;
    span.events = [];
    span.attributes = {};
  }
}
```

#### Lazy Loading

```typescript
// ✅ Good: Load data on demand
class LazyTraceLoader {
  private cache = new Map<string, Span>();

  async getSpan(traceId: string, spanId: string): Promise<Span> {
    const cacheKey = `${traceId}:${spanId}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const span = await this.loadSpanFromStorage(traceId, spanId);
    this.cache.set(cacheKey, span);
    return span;
  }
}
```

## Performance Patterns

### 1. Caching Strategies

#### LRU Cache

```typescript
// ✅ Good: Bounded cache with eviction
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) return undefined;

    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value); // Move to end
    return value;
  }

  set(key: K, value: V) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
```

#### Memoization

```typescript
// ✅ Good: Cache expensive computations
function memoize<T extends (...args: any[]) => any>(
  fn: T,
  resolver?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, ReturnType<T>>();

  return ((...args: Parameters<T>) => {
    const key = resolver ? resolver(...args) : JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

// Usage
const expensiveCalculation = memoize(
  (trace: Trace) => {
    // Expensive computation
    return computeTraceStats(trace);
  },
  trace => trace.metadata.id
);
```

### 2. Batch Processing

```typescript
// ✅ Good: Batch operations for efficiency
class BatchTraceWriter {
  private buffer: Trace[] = [];
  private batchSize: number;
  private flushInterval: NodeJS.Timeout;

  constructor(batchSize: number = 100, flushIntervalMs: number = 5000) {
    this.batchSize = batchSize;
    this.flushInterval = setInterval(() => this.flush(), flushIntervalMs);
  }

  async write(trace: Trace) {
    this.buffer.push(trace);

    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  private async flush() {
    if (this.buffer.length === 0) return;

    const batch = this.buffer.splice(0, this.batchSize);
    await this.writeBatch(batch);
  }
}
```

### 3. Debouncing and Throttling

```typescript
// ✅ Good: Limit update frequency
class DebouncedTraceUpdater {
  private timeout: NodeJS.Timeout | null = null;

  update(trace: Trace, delay: number = 100) {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    this.timeout = setTimeout(() => {
      this.applyUpdate(trace);
      this.timeout = null;
    }, delay);
  }
}
```

## Performance Testing

### Benchmark Suite

```typescript
// ✅ Good: Comprehensive benchmarks
import { bench, describe } from 'vitest';

describe('Trace Processing Benchmarks', () => {
  const smallTrace = createTrace(100);
  const mediumTrace = createTrace(1000);
  const largeTrace = createTrace(10000);

  bench('process small trace', async () => {
    await processTrace(smallTrace);
  });

  bench('process medium trace', async () => {
    await processTrace(mediumTrace);
  });

  bench('process large trace (streaming)', async () => {
    await streamProcessTrace(largeTrace);
  });
});
```

### Load Testing

```typescript
// ✅ Good: Simulate real-world load
class LoadTester {
  async runConcurrentReplays(concurrency: number, iterations: number) {
    const promises: Promise<void>[] = [];

    for (let i = 0; i < concurrency; i++) {
      promises.push(this.runIterations(iterations));
    }

    await Promise.all(promises);
  }

  private async runIterations(iterations: number) {
    for (let i = 0; i < iterations; i++) {
      const trace = await this.loadRandomTrace();
      await this.replayEngine.replay(trace, { mode: 'stubbed' });
    }
  }
}
```

## Performance Budgets

### Targets

- **Recording Overhead**: < 5% latency increase
- **Replay Speed**: > 10x real-time
- **Memory Usage**: < 100MB for typical traces
- **Startup Time**: < 1 second
- **Trace Compression**: > 10:1 ratio

### Monitoring

```typescript
// ✅ Good: Performance budget enforcement
class PerformanceBudget {
  private budgets = new Map<string, number>();

  setBudget(metric: string, limit: number) {
    this.budgets.set(metric, limit);
  }

  check(metric: string, value: number): boolean {
    const limit = this.budgets.get(metric);
    if (limit === undefined) return true;
    return value <= limit;
  }

  assert(metric: string, value: number) {
    if (!this.check(metric, value)) {
      throw new Error(
        `Performance budget exceeded: ${metric} = ${value}, limit = ${this.budgets.get(metric)}`
      );
    }
  }
}

// Usage
const budget = new PerformanceBudget();
budget.setBudget('replay-duration', 5000);
budget.assert('replay-duration', actualDuration);
```

## Resources

### Documentation

- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)
- [Chrome DevTools Performance Panel](https://developer.chrome.com/docs/devtools/evaluate-performance/)
- [Web Performance Fundamentals](https://web.dev/performance/)

### Tools

- Node.js profiler
- Chrome DevTools
- clinic.js
- 0x
- vitest benchmarks

---

**Maintained by**: @reaatech and contributors  
**Last Updated**: 2026-04-22
