# Agent Replay - Technical Architecture

## System Overview

Agent Replay is a sophisticated deterministic replay system for AI agent interactions. The architecture is designed around four core principles:

1. **Transparency**: Capture all agent interactions without modifying agent code
2. **Determinism**: Guarantee identical replay behavior given the same trace
3. **Efficiency**: Minimize performance overhead during recording and replay
4. **Extensibility**: Support multiple LLM providers and agent frameworks

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Agent Application                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Agent     │  │   Agent     │  │   Agent     │              │
│  │  Logic      │  │  Logic      │  │  Logic      │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                     │
│         ▼                ▼                ▼                     │
│  ┌─────────────────────────────────────────────────┐           │
│  │           Interceptor Layer                      │           │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐     │           │
│  │  │   LLM     │ │   Tool    │ │  Router   │     │           │
│  │  │Interceptor│ │Interceptor│ │Interceptor│     │           │
│  │  └───────────┘ └───────────┘ └───────────┘     │           │
│  └─────────────────────────────────────────────────┘           │
│         │                │                │                     │
│         ▼                ▼                ▼                     │
│  ┌─────────────────────────────────────────────────┐           │
│  │           Recording Engine                       │           │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐     │           │
│  │  │  Event    │ │  State    │ │  Trace    │     │           │
│  │  │ Capture   │ │ Snapshot  │ │ Builder   │     │           │
│  │  └───────────┘ └───────────┘ └───────────┘     │           │
│  └─────────────────────────────────────────────────┘           │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────┐           │
│  │           Trace Storage                          │           │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐     │           │
│  │  │  Local    │ │  Remote   │ │  Indexed  │     │           │
│  │  │  Files    │ │  Storage  │ │  Store    │     │           │
│  │  └───────────┘ └───────────┘ └───────────┘     │           │
│  └─────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         Replay System                            │
│  ┌─────────────────────────────────────────────────┐           │
│  │           Replay Engine                          │           │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐     │           │
│  │  │  Trace    │ │   Stub    │ │  Partial  │     │           │
│  │  │  Loader   │ │  Engine   │ │  Replay   │     │           │
│  │  └───────────┘ └───────────┘ └───────────┘     │           │
│  └─────────────────────────────────────────────────┘           │
│         │                │                │                     │
│         ▼                ▼                ▼                     │
│  ┌─────────────────────────────────────────────────┐           │
│  │           Diff Engine                            │           │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐     │           │
│  │  │ Semantic  │ │Structural │ │Regression │     │           │
│  │  │  Diff     │ │   Diff    │ │Detector   │     │           │
│  │  └───────────┘ └───────────┘ └───────────┘     │           │
│  └─────────────────────────────────────────────────┘           │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────┐           │
│  │           Debugging Tools                        │           │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐     │           │
│  │  │    CLI    │ │  Web UI   │ │   IDE     │     │           │
│  │  │  Debugger │ │  Viewer   │ │Extension  │     │           │
│  │  └───────────┘ └───────────┘ └───────────┘     │           │
│  └─────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Interceptor Layer

The interceptor layer captures all interactions transparently using a combination of techniques:

#### LLM Call Interceptor

```typescript
interface LLMInterceptor {
  // Intercept chat completions
  interceptChatCompletion(
    provider: LLMProvider,
    request: ChatCompletionRequest,
    next: (req: ChatCompletionRequest) => Promise<ChatCompletionResponse>
  ): Promise<ChatCompletionResponse>;

  // Intercept streaming responses
  interceptStreamingChat(
    provider: LLMProvider,
    request: ChatCompletionRequest,
    next: (req: ChatCompletionRequest) => AsyncIterable<StreamChunk>
  ): AsyncIterable<StreamChunk>;

  // Capture embeddings
  interceptEmbeddings(
    provider: LLMProvider,
    request: EmbeddingRequest,
    next: (req: EmbeddingRequest) => Promise<EmbeddingResponse>
  ): Promise<EmbeddingResponse>;
}
```

#### Tool Call Interceptor

```typescript
interface ToolInterceptor {
  // Intercept tool invocations
  interceptToolCall(
    toolName: string,
    toolInput: any,
    next: (input: any) => Promise<any>
  ): Promise<any>;

  // Capture tool registration
  interceptToolRegistration(
    toolDefinition: ToolDefinition,
    toolImplementation: Function
  ): RegisteredTool;
}
```

#### Routing Decision Interceptor

```typescript
interface RouterInterceptor {
  // Capture routing decisions
  interceptRoute(
    context: AgentContext,
    availableRoutes: Route[],
    next: (ctx: AgentContext) => Promise<Route>
  ): Promise<Route>;
}
```

### 2. Trace Data Model

The trace data model is designed to capture complete agent interactions:

```typescript
// Root trace container
interface Trace {
  version: string;
  metadata: TraceMetadata;
  spans: Span[];
  checkpoints: Checkpoint[];
  indexes: TraceIndexes;
}

interface TraceMetadata {
  id: string;
  name: string;
  createdAt: number;
  agentVersion: string;
  environment: EnvironmentInfo;
  tags: string[];
  summary: TraceSummary;
}

// Hierarchical span structure
interface Span {
  id: string;
  parentId?: string;
  name: string;
  kind: SpanKind;
  startTime: number;
  endTime?: number;
  status: SpanStatus;
  events: Event[];
  attributes: Record<string, any>;
  links: SpanLink[];
}

type SpanKind =
  | 'llm_call'
  | 'tool_call'
  | 'agent_step'
  | 'routing_decision'
  | 'state_change'
  | 'error';

// Individual events within spans
interface Event {
  timestamp: number;
  type: EventType;
  name: string;
  attributes: Record<string, any>;
  data?: any;
}

type EventType = 'request' | 'response' | 'error' | 'state_snapshot' | 'checkpoint' | 'annotation';

// Checkpoints for partial replay
interface Checkpoint {
  id: string;
  spanId: string;
  timestamp: number;
  state: SerializedState;
  context: AgentContext;
  metadata: CheckpointMetadata;
}

interface SerializedState {
  variables: Record<string, any>;
  memory: MemorySnapshot;
  conversation: ConversationState;
  toolRegistry: ToolRegistrySnapshot;
}
```

#### State Serialization Strategy

Partial replay requires capturing and restoring arbitrary agent state. This is the hardest technical problem in the system.

```typescript
interface StateCaptureStrategy {
  // Attempt to serialize agent state. Returns null if state is not captureable.
  capture(state: unknown): Promise<SerializedState | null>;

  // Restore state from a previously captured snapshot
  restore(snapshot: SerializedState): Promise<void>;

  // Check if this strategy can handle the given state type
  canHandle(state: unknown): boolean;
}

// Default strategy: structured clone with fallback to JSON
class StructuredCloneStrategy implements StateCaptureStrategy {
  async capture(state: unknown): Promise<SerializedState | null> {
    try {
      return structuredClone(state) as SerializedState;
    } catch {
      return null;
    }
  }
}

// Framework-specific adapters for complex state
interface FrameworkStateAdapter {
  framework: string;
  capture(): Promise<SerializedState>;
  restore(snapshot: SerializedState): Promise<void>;
}

// Registry of custom snapshotters for non-serializable objects
class SnapshotterRegistry {
  private snapshotters = new Map<string, Snapshotter>();

  register(type: string, snapshotter: Snapshotter): void {
    this.snapshotters.set(type, snapshotter);
  }

  snapshot(value: unknown): SnapshottedValue {
    const type = this.detectType(value);
    const snapshotter = this.snapshotters.get(type);
    if (snapshotter) {
      return snapshotter.snapshot(value);
    }
    // Fallback: try structured clone, then throw
    return { type: 'primitive', value: structuredClone(value) };
  }
}
```

**Handling non-serializable state:**

- **Functions / Closures**: Not captured. Agent code changes require full re-recording.
- **Circular references**: Handled by structured clone or explicit reference encoding.
- **Class instances**: Require framework adapters or custom snapshotters.
- **External resources (DB connections, file handles)**: Not captured; rehydration hooks allow reconnection on restore.

**Deterministic replay primitives:**
To ensure identical replay behavior, the system controls non-deterministic sources:

- **Clock**: `Date.now()` and `performance.now()` are replaced with recorded timestamps during replay
- **Random**: `Math.random()` and `crypto.randomUUID()` use seeded PRNGs during replay
- **Environment**: `process.env` is snapshotted at record time and injected during replay
- **I/O**: File system and network calls are either stubbed or recorded as span events

### 3. Recording Engine

The recording engine orchestrates trace capture:

```typescript
class RecordingEngine {
  private traceBuilder: TraceBuilder;
  private interceptors: InterceptorRegistry;
  private stateManager: StateManager;
  private storage: TraceStorage;

  async startRecording(config: RecordingConfig): Promise<RecordingSession> {
    // Initialize trace
    const trace = this.traceBuilder.create(config);

    // Register interceptors
    await this.interceptors.enable(config.providers);

    // Start state tracking
    await this.stateManager.beginTracking();

    return new RecordingSession(trace, this);
  }

  async stopRecording(session: RecordingSession): Promise<Trace> {
    // Finalize trace
    const trace = session.trace.finalize();

    // Unregister interceptors
    await this.interceptors.disable();

    // Persist trace
    await this.storage.save(trace);

    return trace;
  }

  async captureEvent(event: Event, context: CaptureContext): Promise<void> {
    // Add event to current span
    session.trace.addEvent(event, context);

    // Create checkpoint if needed
    if (this.shouldCheckpoint(event, context)) {
      await this.createCheckpoint(session, context);
    }
  }
}
```

### 4. Replay Engine

The replay engine provides deterministic playback with multiple modes:

```typescript
class ReplayEngine {
  private traceLoader: TraceLoader;
  private stubEngine: StubEngine;
  private stateManager: StateManager;
  private diffEngine: DiffEngine;

  async replay(trace: Trace, config: ReplayConfig): Promise<ReplayResult> {
    // Load trace
    const session = await this.traceLoader.load(trace);

    // Initialize replay state
    await this.stateManager.restore(config.checkpoint);

    // Execute replay
    const result = await this.executeReplay(session, config);

    return result;
  }

  private async executeReplay(session: ReplaySession, config: ReplayConfig): Promise<ReplayResult> {
    const replayMode = config.mode || 'stubbed';

    switch (replayMode) {
      case 'stubbed':
        return await this.stubbedReplay(session, config);

      case 'live':
        return await this.liveReplay(session, config);

      case 'partial':
        return await this.partialReplay(session, config);

      case 'diff':
        return await this.diffReplay(session, config);
    }
  }

  private async stubbedReplay(session: ReplaySession, config: ReplayConfig): Promise<ReplayResult> {
    // Replace all LLM calls with recorded responses
    this.stubEngine.activate(session.trace);

    // Execute agent with stubbed responses
    const result = await this.executeAgent(session.agent, config);

    // Verify deterministic behavior
    this.verifyDeterminism(session.trace, result);

    return result;
  }

  private async partialReplay(
    session: ReplaySession,
    config: PartialReplayConfig
  ): Promise<ReplayResult> {
    // Replay up to checkpoint N
    await this.replayToCheckpoint(session, config.checkpointId);

    // Transition to live mode
    this.stubEngine.deactivate();

    // Continue with live LLM calls
    const result = await this.executeAgentLive(session.agent, config);

    // Track divergence
    const divergence = this.detectDivergence(session.trace, result);

    return { ...result, divergence };
  }

  private async diffReplay(session: ReplaySession, config: DiffReplayConfig): Promise<DiffResult> {
    // Run agent with live LLM calls against the recorded trace
    const liveResult = await this.liveReplay(session, config);

    // Compare live outputs directly against the recorded trace
    const diff = await this.diffEngine.compare(session.trace, liveResult, config.diffOptions);

    return diff;
  }
}
```

### 5. Streaming LLM Handling

Modern LLM APIs default to streaming responses. The system must record, replay, and diff streams correctly.

### Recording Streams

```typescript
interface StreamChunk {
  index: number; // Chunk sequence number
  delta: string; // Text delta (or tool call delta)
  finishReason?: string; // 'stop' | 'length' | 'tool_calls' | etc.
  usage?: TokenUsage; // Often only present on final chunk
}

interface RecordedStream {
  chunks: StreamChunk[];
  aggregatedContent: string; // Pre-computed full text
  aggregatedToolCalls?: ToolCall[]; // Pre-computed tool calls
  duration: number;
  totalChunks: number;
}
```

During recording, each chunk is captured with its index and delta. The recording engine also pre-computes the aggregated content and tool calls so that non-streaming consumers don't need to reassemble the stream.

### Replaying Streams

```typescript
class StreamingStubEngine {
  async *replayStream(recorded: RecordedStream): AsyncIterable<StreamChunk> {
    for (const chunk of recorded.chunks) {
      yield chunk;
      // Optional: simulate original timing
      if (this.config.preserveTiming) {
        await this.delay(chunk.timingDelay);
      }
    }
  }
}
```

Stubbed replay yields the exact recorded chunks in order. Timing can be preserved or executed as fast as possible.

### Diffing Streams

For diff mode, streamed and non-streamed outputs are normalized before comparison:

```typescript
function normalizeStreamOutput(recorded: RecordedStream | string): NormalizedOutput {
  if (typeof recorded === 'string') {
    return { content: recorded, toolCalls: [] };
  }
  return {
    content: recorded.aggregatedContent,
    toolCalls: recorded.aggregatedToolCalls ?? [],
  };
}
```

The semantic diff compares `aggregatedContent` and `aggregatedToolCalls`, not individual chunks.

## 6. Diff Engine

The diff engine provides sophisticated comparison capabilities:

```typescript
class DiffEngine {
  private semanticComparer: SemanticComparer;
  private structuralComparer: StructuralComparer;
  private statisticalAnalyzer: StatisticalAnalyzer;

  async compare(
    recorded: Trace | ReplayResult,
    replayed: ReplayResult,
    options: DiffOptions
  ): Promise<DiffResult> {
    const diffs: TraceDiff[] = [];

    // Structural comparison
    const structuralDiff = await this.structuralComparer.compare(recorded.trace, replayed.trace);
    diffs.push(structuralDiff);

    // Semantic comparison
    const semanticDiff = await this.semanticComparer.compare(recorded.outputs, replayed.outputs);
    diffs.push(semanticDiff);

    // Statistical analysis
    const stats = await this.statisticalAnalyzer.analyze(recorded.metrics, replayed.metrics);

    // Generate report
    const report = this.generateDiffReport(diffs, stats, options);

    return {
      diffs,
      statistics: stats,
      report,
      severity: this.calculateSeverity(diffs, stats),
    };
  }
}
```

### 7. Trace Format Specification

### File Format

Traces are stored as **`.artrace.json`** files (Agent Replay Trace JSON). This is a line-delimited JSON format for streaming and partial reads.

```
my-trace.artrace.json
├── Header line: trace metadata and schema version
├── Span lines: one JSON object per span
├── Checkpoint lines: inserted at their position in the timeline
└── Footer line: indexes and summary
```

**Why line-delimited JSON?**

- Streaming: Process traces without loading into memory
- Append-friendly: Add checkpoints without rewriting the file
- Human-readable: Can inspect with standard tools (`head`, `jq`)
- Compression: Individual lines compress well with gzip

### Schema Versioning

```typescript
interface TraceHeader {
  version: '1.0.0';
  format: 'artrace-json-v1';
  metadata: TraceMetadata;
  schema: {
    spanKinds: string[];
    eventTypes: string[];
    compression?: 'gzip' | 'none';
  };
}
```

Trace format versions follow SemVer. The `TraceMigrator` utility upgrades traces between minor versions automatically.

### Large Trace Handling

For traces exceeding 100MB:

- **Chunked storage**: Spans are written to `.artrace.json` in chunks of 1000
- **External blob storage**: Large payloads (full LLM responses, images) are stored as sidecar files referenced by hash
- **Memory mapping**: The trace index is memory-mapped for O(1) span lookup
- **Streaming replay**: The replay engine yields spans from disk without full materialization

### Binary Format (Future)

A compact binary format using MessagePack may be introduced for production deployments where trace size is critical. The binary format will be a 1:1 encoding of the JSON format, not a separate schema.

## 8. Storage Layer

The storage layer provides flexible trace persistence:

```typescript
interface TraceStorage {
  // Save trace
  save(trace: Trace, options?: StorageOptions): Promise<void>;

  // Load trace
  load(id: string, options?: StorageOptions): Promise<Trace>;

  // List traces
  list(filter?: TraceFilter): Promise<TraceSummary[]>;

  // Delete trace
  delete(id: string): Promise<void>;

  // Search traces
  search(query: SearchQuery): Promise<TraceSearchResult>;
}

// Implementations
class LocalFileStorage implements TraceStorage {
  // File-based storage with indexing
}

class SQLiteStorage implements TraceStorage {
  // SQLite-based storage for complex queries
}

class RemoteStorage implements TraceStorage {
  // Cloud storage integration (S3, GCS, Azure Blob)
}
```

## Data Flow

### Recording Flow

```
1. Agent makes LLM call
   ↓
2. Interceptor captures request
   ↓
3. Recording engine creates span
   ↓
4. Request forwarded to LLM
   ↓
5. Interceptor captures response
   ↓
6. Recording engine adds response to span
   ↓
7. State manager captures checkpoint (if needed)
   ↓
8. Trace persisted to storage
```

### Replay Flow

```
1. Load trace from storage
   ↓
2. Initialize replay session
   ↓
3. Restore state from checkpoint (if partial replay)
   ↓
4. For each span in trace:
   a. If stubbed mode: return recorded response
   b. If live mode: call actual LLM
   c. If partial mode: switch at checkpoint
   ↓
5. Capture any divergence
   ↓
6. Generate replay report
```

## Performance Considerations

### Memory Management

```typescript
class MemoryManager {
  // Streaming trace processing for large traces
  async streamTrace(trace: Trace): AsyncIterable<Span> {
    // Process trace in chunks
  }

  // Efficient state serialization
  serializeState(state: AgentState): Buffer {
    // Use binary format for efficiency
    return protobuf.encode(state);
  }

  // Memory-efficient diff computation
  async computeDiffIncremental(recorded: Trace, replayed: Trace): Promise<DiffResult> {
    // Stream-based comparison
  }
}
```

### Concurrency

```typescript
class ConcurrentReplayEngine {
  // Parallel span processing
  async replayParallel(trace: Trace, config: ReplayConfig): Promise<ReplayResult> {
    const spans = trace.spans;
    const chunks = this.chunkSpans(spans, config.parallelism);

    const results = await Promise.all(chunks.map(chunk => this.replayChunk(chunk, config)));

    return this.mergeResults(results);
  }
}
```

## Error Hierarchy

All errors extend from a base `AgentReplayError` with machine-readable codes.

```typescript
abstract class AgentReplayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      cause: this.cause?.toString(),
    };
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
    public readonly validationErrors: ValidationError[]
  ) {
    super(message, 'INVALID_TRACE');
  }
}

class ReplayFailedError extends AgentReplayError {
  constructor(
    message: string,
    public readonly step: number,
    cause?: Error
  ) {
    super(message, 'REPLAY_FAILED', cause);
  }
}

class StateCaptureError extends AgentReplayError {
  constructor(
    message: string,
    public readonly stateType: string,
    cause?: Error
  ) {
    super(message, 'STATE_CAPTURE_FAILED', cause);
  }
}

class DivergenceError extends AgentReplayError {
  constructor(
    message: string,
    public readonly divergence: DivergenceReport
  ) {
    super(message, 'DIVERGENCE_DETECTED');
  }
}

class InterceptorError extends AgentReplayError {
  constructor(provider: string, cause?: Error) {
    super(`Failed to install interceptor for ${provider}`, 'INTERCEPTOR_FAILED', cause);
  }
}
```

## Security Considerations

### Data Protection

```typescript
interface SecurityConfig {
  // Encryption at rest
  encryption: {
    algorithm: 'aes-256-gcm';
    keyManagement: 'aws-kms' | 'gcp-kms' | 'azure-keyvault';
  };

  // Access control
  accessControl: {
    enabled: boolean;
    provider: 'rbac' | 'abac';
  };

  // Audit logging
  audit: {
    enabled: boolean;
    retention: number;
  };
}
```

### Sanitization

```typescript
class TraceSanitizer {
  // Remove sensitive information
  sanitize(trace: Trace, policy: SanitizationPolicy): Trace {
    // Remove PII, API keys, etc.
    return this.applyPolicy(trace, policy);
  }

  // Redact specific patterns
  redactPatterns(trace: Trace, patterns: RegExp[]): Trace {
    // Apply regex-based redaction
    return this.applyRedaction(trace, patterns);
  }
}
```

## Extensibility Points

### Custom Interceptors

```typescript
class CustomInterceptor implements Interceptor {
  async intercept(context: InterceptorContext, next: NextFunction): Promise<any> {
    // Custom interception logic
    return next(context);
  }
}
```

### Custom Storage

```typescript
class CustomStorage implements TraceStorage {
  async save(trace: Trace): Promise<void> {
    // Custom storage logic
  }

  async load(id: string): Promise<Trace> {
    // Custom loading logic
  }
}
```

### Custom Diff Strategies

```typescript
class CustomDiffStrategy implements DiffStrategy {
  async compare(recorded: any, replayed: any): Promise<DiffResult> {
    // Custom comparison logic
  }
}
```

## Deployment Scenarios

### Local Development

```yaml
# docker-compose.yml for local development
version: '3.8'
services:
  agent-replay:
    image: reaatech/agent-replay:latest
    ports:
      - '3000:3000' # Web UI
      - '3001:3001' # API
    volumes:
      - ./traces:/app/traces
    environment:
      - STORAGE_BACKEND=local
      - LOG_LEVEL=debug
```

### Production Deployment

```yaml
# Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-replay
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: agent-replay
          image: reaatech/agent-replay:latest
          env:
            - name: STORAGE_BACKEND
              value: 's3'
            - name: ENCRYPTION_ENABLED
              value: 'true'
```

## Monitoring & Observability

### Metrics

```typescript
interface ReplayMetrics {
  // Performance metrics
  replayDuration: number;
  memoryUsage: number;
  cpuUsage: number;

  // Accuracy metrics
  determinismScore: number;
  divergenceRate: number;

  // Business metrics
  tokenSavings: number;
  debugTimeReduction: number;
}
```

### Logging

```typescript
interface ReplayLogs {
  // Structured logging
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';

  // Log aggregation
  destination: 'console' | 'file' | 'remote';

  // Sampling
  sampleRate: number;
}
```

## Testing Strategy

### Unit Tests

```typescript
describe('ReplayEngine', () => {
  it('should replay trace deterministically', async () => {
    const trace = createTestTrace();
    const engine = new ReplayEngine();

    const result1 = await engine.replay(trace, { mode: 'stubbed' });
    const result2 = await engine.replay(trace, { mode: 'stubbed' });

    expect(result1).toEqual(result2);
  });
});
```

### Integration Tests

```typescript
describe('End-to-End Replay', () => {
  it('should handle partial replay correctly', async () => {
    const trace = await recordAgentInteraction();
    const engine = new ReplayEngine();

    const result = await engine.replay(trace, {
      mode: 'partial',
      checkpointId: 'checkpoint-3',
    });

    expect(result.divergence).toBeDefined();
  });
});
```

## Conclusion

This architecture provides a robust foundation for building Agent Replay. The modular design allows for easy extension and maintenance, while the focus on performance and security ensures production readiness. The clear separation of concerns between recording, replay, and debugging components enables independent evolution of each subsystem.

The architecture supports the key differentiator of partial replay through the checkpoint system, allowing developers to debug specific failure points without replaying entire traces. The diff engine provides sophisticated comparison capabilities for detecting behavioral changes across agent versions.
