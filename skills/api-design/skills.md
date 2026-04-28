# API Design Skill

## Overview

The API Design skill encompasses creating clean, intuitive, and maintainable interfaces for the Agent Replay system. Good API design reduces cognitive load, prevents misuse, and enables extensibility.

## Core Principles

### 1. Clarity Over Cleverness

- Names should be self-explanatory
- Avoid clever but confusing abstractions
- Prefer explicit over implicit behavior
- Document edge cases and assumptions

### 2. Consistency

- Follow established patterns throughout the codebase
- Use consistent naming conventions
- Maintain uniform error handling
- Apply the same abstraction level

### 3. Composability

- Small, focused functions
- Functions should do one thing well
- Enable function composition
- Minimize side effects

### 4. Extensibility

- Design for future growth
- Use interfaces for abstraction
- Support plugin architectures
- Avoid breaking changes

## API Design Patterns

### Builder Pattern

```typescript
// ✅ Good: Fluent builder for complex objects
class TraceBuilder {
  private trace: Partial<Trace> = {};

  withMetadata(metadata: TraceMetadata): this {
    this.trace.metadata = metadata;
    return this;
  }

  addSpan(span: Span): this {
    if (!this.trace.spans) this.trace.spans = [];
    this.trace.spans.push(span);
    return this;
  }

  build(): Trace {
    return validateAndFinalizeTrace(this.trace);
  }
}

// Usage
const trace = new TraceBuilder()
  .withMetadata({ id: '123', name: 'Test' })
  .addSpan(llmSpan)
  .addSpan(toolSpan)
  .build();
```

### Strategy Pattern

```typescript
// ✅ Good: Pluggable replay strategies
interface ReplayStrategy {
  execute(trace: Trace, context: ReplayContext): Promise<ReplayResult>;
}

class StubbedReplayStrategy implements ReplayStrategy {
  async execute(trace: Trace, context: ReplayContext): Promise<ReplayResult> {
    // Stub all LLM calls
  }
}

class LiveReplayStrategy implements ReplayStrategy {
  async execute(trace: Trace, context: ReplayContext): Promise<ReplayResult> {
    // Call real LLM APIs
  }
}

class PartialReplayStrategy implements ReplayStrategy {
  async execute(trace: Trace, context: ReplayContext): Promise<ReplayResult> {
    // Replay up to checkpoint, then go live
  }
}

// Usage
const strategy = new PartialReplayStrategy(checkpointId);
const result = await strategy.execute(trace, context);
```

### Observer Pattern

```typescript
// ✅ Good: Event-driven trace processing
interface TraceObserver {
  onSpanCreated(span: Span): void;
  onSpanCompleted(span: Span): void;
  onCheckpointCreated(checkpoint: Checkpoint): void;
  onError(error: TraceError): void;
}

class TraceRecorder {
  private observers: TraceObserver[] = [];

  addObserver(observer: TraceObserver): void {
    this.observers.push(observer);
  }

  private notifySpanCreated(span: Span): void {
    this.observers.forEach(obs => obs.onSpanCreated(span));
  }
}
```

### Factory Pattern

```typescript
// ✅ Good: Centralized object creation
interface InterceptorFactory {
  createInterceptor(config: InterceptorConfig): Interceptor;
}

class LLMInterceptorFactory implements InterceptorFactory {
  createInterceptor(config: InterceptorConfig): Interceptor {
    switch (config.provider) {
      case 'openai':
        return new OpenAIInterceptor(config);
      case 'anthropic':
        return new AnthropicInterceptor(config);
      case 'azure':
        return new AzureOpenAIInterceptor(config);
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }
}
```

## Interface Design

### Method Signatures

```typescript
// ✅ Good: Clear, consistent signatures
interface TraceStorage {
  // CRUD operations
  save(trace: Trace, options?: SaveOptions): Promise<void>;
  load(id: string, options?: LoadOptions): Promise<Trace>;
  update(id: string, updates: Partial<Trace>): Promise<Trace>;
  delete(id: string): Promise<void>;

  // Query operations
  list(filter?: TraceFilter): Promise<TraceSummary[]>;
  search(query: SearchQuery): Promise<TraceSearchResult>;
  exists(id: string): Promise<boolean>;
}

// ❌ Bad: Inconsistent, unclear signatures
interface BadStorage {
  save(data: any): Promise<any>;
  get(id: string): any;
  remove(id: string, force?: boolean, callback?: Function): void;
  find(query?: any, options?: any, callback?: any): any;
}
```

### Options Objects

```typescript
// ✅ Good: Options object for many parameters
interface ReplayOptions {
  mode?: 'stubbed' | 'live' | 'partial' | 'diff';
  checkpointId?: string;
  maxSteps?: number;
  timeout?: number;
  onProgress?: (progress: ReplayProgress) => void;
  signal?: AbortSignal;
}

async function replay(trace: Trace, options: ReplayOptions = {}): Promise<ReplayResult> {
  const {
    mode = 'stubbed',
    checkpointId,
    maxSteps = Infinity,
    timeout = 30000,
    onProgress,
    signal,
  } = options;

  // Implementation
}

// Usage
const result = await replay(trace, {
  mode: 'partial',
  checkpointId: 'cp-3',
  onProgress: p => console.log(`Progress: ${p.percent}%`),
});
```

### Result Types

```typescript
// ✅ Good: Explicit success/failure types
type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

async function loadTrace(id: string): Promise<Result<Trace, TraceError>> {
  try {
    const trace = await storage.load(id);
    return { success: true, data: trace };
  } catch (error) {
    return {
      success: false,
      error: new TraceError(`Failed to load trace: ${error.message}`),
    };
  }
}

// Usage
const result = await loadTrace('123');
if (result.success) {
  console.log(result.data.spans);
} else {
  console.error(result.error);
}
```

## Error Handling

### Custom Error Hierarchy

```typescript
// ✅ Good: Specific error types
abstract class AgentReplayError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

class TraceNotFoundError extends AgentReplayError {
  constructor(traceId: string) {
    super(`Trace not found: ${traceId}`, 'TRACE_NOT_FOUND');
  }
}

class InvalidTraceError extends AgentReplayError {
  constructor(
    message: string,
    public validationErrors: ValidationError[]
  ) {
    super(message, 'INVALID_TRACE');
  }
}

class ReplayFailedError extends AgentReplayError {
  constructor(
    message: string,
    public step: number,
    public cause?: Error
  ) {
    super(message, 'REPLAY_FAILED', cause);
  }
}
```

### Error Context

```typescript
// ✅ Good: Rich error context
class TraceValidationError extends Error {
  constructor(
    message: string,
    public traceId: string,
    public field: string,
    public expected: string,
    public actual: any,
    public suggestions: string[]
  ) {
    super(message);
    this.name = 'TraceValidationError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      traceId: this.traceId,
      field: this.field,
      expected: this.expected,
      actual: this.actual,
      suggestions: this.suggestions,
    };
  }
}
```

## Async API Design

### Promise-Based APIs

```typescript
// ✅ Good: Consistent async API
interface AsyncTraceProcessor {
  // All methods return promises
  process(trace: Trace): Promise<ProcessingResult>;
  validate(trace: Trace): Promise<ValidationResult>;
  optimize(trace: Trace): Promise<OptimizationResult>;

  // Streaming support
  streamProcess(trace: Trace): AsyncIterable<ProcessingChunk>;
}
```

### Async Iterators

```typescript
// ✅ Good: Async iteration for large datasets
class TraceStreamer {
  async *streamSpans(trace: Trace): AsyncIterable<Span> {
    for (const span of trace.spans) {
      yield span;
      await this.delay(0); // Allow other operations
    }
  }

  async *streamCheckpoints(trace: Trace): AsyncIterable<Checkpoint> {
    for (const checkpoint of trace.checkpoints) {
      yield checkpoint;
      await this.delay(0);
    }
  }
}

// Usage
const streamer = new TraceStreamer();
for await (const span of streamer.streamSpans(trace)) {
  console.log(`Processing span: ${span.name}`);
}
```

### Abort Signals

```typescript
// ✅ Good: Cancellation support
interface ReplayOptions {
  signal?: AbortSignal;
  timeout?: number;
}

async function replay(trace: Trace, options: ReplayOptions = {}): Promise<ReplayResult> {
  const { signal, timeout = 30000 } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    signal?.addEventListener('abort', () => controller.abort());
    return await this.executeReplay(trace, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
```

## Configuration Design

### Hierarchical Configuration

```typescript
// ✅ Good: Layered configuration
interface AgentReplayConfig {
  // Base defaults
  defaults: {
    storage: StorageConfig;
    interceptors: InterceptorConfig[];
    replay: ReplayConfig;
  };

  // Environment overrides
  environment: {
    development?: Partial<AgentReplayConfig['defaults']>;
    production?: Partial<AgentReplayConfig['defaults']>;
  };

  // User overrides
  user: Partial<AgentReplayConfig['defaults']>;
}

function mergeConfig(config: AgentReplayConfig): ResolvedConfig {
  const env = process.env.NODE_ENV || 'development';
  const envConfig = config.environment[env] || {};

  return {
    ...config.defaults,
    ...envConfig,
    ...config.user,
  };
}
```

### Validation

```typescript
// ✅ Good: Configuration validation
class ConfigValidator {
  static validate(config: AgentReplayConfig): ValidationResult {
    const errors: ValidationError[] = [];

    if (!config.defaults.storage) {
      errors.push(new ValidationError('Storage configuration is required'));
    }

    if (config.defaults.storage.type === 's3' && !config.defaults.storage.bucket) {
      errors.push(new ValidationError('S3 bucket is required for S3 storage'));
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
```

## Versioning and Evolution

### API Versioning

```typescript
// ✅ Good: Versioned APIs
interface AgentReplayV1 {
  record(config: RecordConfigV1): Promise<TraceV1>;
  replay(trace: TraceV1, options: ReplayOptionsV1): Promise<ReplayResultV1>;
}

interface AgentReplayV2 extends AgentReplayV1 {
  // New methods
  diff(trace1: TraceV2, trace2: TraceV2): Promise<DiffResultV2>;

  // Enhanced methods
  record(config: RecordConfigV2): Promise<TraceV2>;
}
```

### Migration Strategies

```typescript
// ✅ Good: Migration utilities
class TraceMigrator {
  static migrate(trace: TraceV1): TraceV2 {
    return {
      ...trace,
      version: '2.0.0',
      metadata: this.migrateMetadata(trace.metadata),
      spans: trace.spans.map(span => this.migrateSpan(span)),
      checkpoints: trace.checkpoints?.map(cp => this.migrateCheckpoint(cp)) || [],
    };
  }

  private static migrateMetadata(metadata: MetadataV1): MetadataV2 {
    return {
      ...metadata,
      createdAt: metadata.timestamp,
      environment: {
        ...metadata.env,
        node: metadata.env.nodeVersion,
      },
    };
  }
}
```

## Documentation

### JSDoc Comments

````typescript
// ✅ Good: Comprehensive JSDoc
/**
 * Records agent interactions and creates a trace.
 *
 * @param agent - The agent to record
 * @param config - Recording configuration
 * @returns A promise that resolves to the recorded trace
 *
 * @throws {AgentError} If the agent is not properly initialized
 * @throws {InterceptorError} If interceptor setup fails
 *
 * @example
 * ```typescript
 * const trace = await record(agent, {
 *   providers: ['openai'],
 *   output: './traces'
 * });
 * ```
 */
async function record(agent: Agent, config: RecordConfig): Promise<Trace> {
  // Implementation
}
````

### README Examples

````markdown
# Agent Replay API

## Quick Start

```typescript
import { AgentReplay } from '@reaatech/agent-replay';

// Initialize
const replay = new AgentReplay({
  storage: { type: 'local', path: './traces' },
});

// Record
const trace = await replay.record(agent, {
  providers: ['openai', 'anthropic'],
});

// Replay
const result = await replay.replay(trace, {
  mode: 'stubbed',
});
```
````

## API Reference

### Methods

#### `record(agent, config?)`

Records agent interactions.

#### `replay(trace, options?)`

Replays a recorded trace.

````

## Testing APIs

### API Testing Patterns
```typescript
describe('TraceStorage API', () => {
  let storage: TraceStorage;

  beforeEach(() => {
    storage = createTestStorage();
  });

  describe('save()', () => {
    it('should save valid trace', async () => {
      const trace = createValidTrace();
      await expect(storage.save(trace)).resolves.not.toThrow();
    });

    it('should reject invalid trace', async () => {
      const trace = createInvalidTrace();
      await expect(storage.save(trace)).rejects.toThrow(InvalidTraceError);
    });
  });

  describe('load()', () => {
    it('should load existing trace', async () => {
      const trace = await storage.save(createValidTrace());
      const loaded = await storage.load(trace.metadata.id);
      expect(loaded).toEqual(trace);
    });

    it('should throw for missing trace', async () => {
      await expect(storage.load('missing')).rejects.toThrow(TraceNotFoundError);
    });
  });
});
````

## Resources

### Documentation

- [TypeScript API Design Guidelines](https://github.com/Microsoft/TypeScript-wiki/blob/main/API-Design-guidelines.md)
- [Node.js API Design Guide](https://nodejs.org/en/docs/guides/designing-single-purpose-libraries/)
- [Clean Code: API Design](https://www.goodreads.com/book/show/3735293-clean-code)

### Tools

- TypeDoc - API documentation generator
- OpenAPI - API specification
- Swagger - API documentation

---

**Maintained by**: @reaatech and contributors  
**Last Updated**: 2026-04-22
