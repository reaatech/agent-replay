// Shared types and utilities for Agent Replay

// Trace data model
export interface Trace {
  version: string;
  metadata: TraceMetadata;
  spans: Span[];
  checkpoints: Checkpoint[];
  indexes: TraceIndexes;
}

export interface TraceMetadata {
  id: string;
  name: string;
  createdAt: number;
  agentVersion: string;
  environment: EnvironmentInfo;
  tags: string[];
  summary: TraceSummary;
}

export interface TraceSummary {
  id: string;
  name: string;
  spanCount: number;
  duration: number;
}

export interface EnvironmentInfo {
  node: string;
  platform: string;
  arch: string;
}

export type SpanKind =
  | 'llm_call'
  | 'tool_call'
  | 'agent_step'
  | 'routing_decision'
  | 'state_change'
  | 'error';

export interface Span {
  id: string;
  parentId?: string;
  name: string;
  kind: SpanKind;
  startTime: number;
  endTime?: number;
  status: SpanStatus;
  events: Event[];
  attributes: Record<string, unknown>;
  links: SpanLink[];
}

export type SpanStatus = 'ok' | 'error' | 'in_progress';

export interface SpanLink {
  traceId: string;
  spanId: string;
  attributes?: Record<string, unknown>;
}

export type EventType =
  | 'request'
  | 'response'
  | 'error'
  | 'state_snapshot'
  | 'checkpoint'
  | 'annotation';

export interface Event {
  timestamp: number;
  type: EventType;
  name: string;
  attributes: Record<string, unknown>;
  data?: unknown;
}

export interface Checkpoint {
  id: string;
  spanId: string;
  timestamp: number;
  state: SerializedState;
  context: AgentContext;
  metadata: CheckpointMetadata;
}

export interface SerializedState {
  variables: Record<string, unknown>;
  memory: MemorySnapshot;
  conversation: ConversationState;
  toolRegistry: ToolRegistrySnapshot;
}

export interface MemorySnapshot {
  entries: MemoryEntry[];
}

export interface MemoryEntry {
  key: string;
  value: unknown;
  timestamp: number;
}

export interface ConversationState {
  messages: Message[];
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolRegistrySnapshot {
  tools: ToolDefinition[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface CheckpointMetadata {
  name: string;
  description?: string;
}

export interface AgentContext {
  sessionId: string;
  variables: Record<string, unknown>;
}

export interface CaptureContext {
  spanId?: string;
  timestamp?: number;
}

export interface TraceIndexes {
  byId: Record<string, number>;
  byKind: Record<SpanKind, number[]>;
}

export interface TraceHeader {
  version: string;
  format: string;
  metadata: TraceMetadata;
  schema: {
    spanKinds: string[];
    eventTypes: string[];
    compression?: 'gzip' | 'none';
  };
}

// LLM abstractions
export interface LLMRequest {
  provider: string;
  model: string;
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  raw: Record<string, unknown>;
}

export interface LLMResponse {
  id: string;
  model: string;
  content: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  finishReason: string;
  raw: Record<string, unknown>;
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface StreamChunk {
  index: number;
  delta: string;
  toolCallDelta?: unknown;
  finishReason?: string;
  usage?: TokenUsage;
}

export interface RecordedStream {
  chunks: StreamChunk[];
  aggregatedContent: string;
  aggregatedToolCalls?: ToolCall[];
  duration: number;
  totalChunks: number;
}

// Error hierarchy
export abstract class AgentReplayError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      cause: this.cause?.toString(),
    };
  }
}

export class RecordingFailedError extends AgentReplayError {
  constructor(message: string, cause?: Error) {
    super(message, 'RECORDING_FAILED', cause);
  }
}

export class TraceNotFoundError extends AgentReplayError {
  constructor(traceId: string) {
    super(`Trace not found: ${traceId}`, 'TRACE_NOT_FOUND');
  }
}

export class InvalidTraceError extends AgentReplayError {
  constructor(
    message: string,
    public readonly validationErrors: ValidationError[],
  ) {
    super(message, 'INVALID_TRACE');
  }
}

export class ReplayFailedError extends AgentReplayError {
  constructor(
    message: string,
    public readonly step: number,
    cause?: Error,
  ) {
    super(message, 'REPLAY_FAILED', cause);
  }
}

export class StateCaptureError extends AgentReplayError {
  constructor(
    message: string,
    public readonly stateType: string,
    cause?: Error,
  ) {
    super(message, 'STATE_CAPTURE_FAILED', cause);
  }
}

export class DivergenceError extends AgentReplayError {
  constructor(
    message: string,
    public readonly divergence: DivergenceReport,
  ) {
    super(message, 'DIVERGENCE_DETECTED');
  }
}

export class InterceptorError extends AgentReplayError {
  constructor(provider: string, cause?: Error) {
    super(`Failed to install interceptor for ${provider}`, 'INTERCEPTOR_FAILED', cause);
  }
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface DivergenceReport {
  step: number;
  expected: unknown;
  actual: unknown;
  path: string;
}

// Storage abstractions
export interface TraceStorage {
  save(trace: Trace, options?: StorageOptions): Promise<string>;
  load(id: string, options?: StorageOptions): Promise<Trace>;
  list(filter?: TraceFilter): Promise<TraceSummary[]>;
  delete(id: string): Promise<void>;
  search(query: SearchQuery): Promise<TraceSearchResult>;
}

export interface StorageOptions {
  compress?: boolean;
  encryption?: boolean;
}

export interface TraceFilter {
  tags?: string[];
  startDate?: number;
  endDate?: number;
  status?: SpanStatus;
}

export interface SearchQuery {
  text: string;
  limit?: number;
  offset?: number;
}

export interface TraceSearchResult {
  results: TraceSummary[];
  total: number;
}

// Configuration
export interface RecordingConfig {
  name: string;
  providers?: string[];
  outputPath?: string;
  captureState?: boolean;
  checkpointInterval?: number;
  tags?: string[];
}

export interface ReplayConfig {
  mode: 'stubbed' | 'live' | 'partial' | 'diff';
  checkpointId?: string;
  maxSteps?: number;
  timeout?: number;
  onProgress?: (progress: ReplayProgress) => void;
  signal?: AbortSignal;
}

export interface PartialReplayConfig extends ReplayConfig {
  mode: 'partial';
  checkpointId: string;
}

export interface DiffReplayConfig extends ReplayConfig {
  mode: 'diff';
  diffOptions?: DiffOptions;
}

export interface ReplayProgress {
  percent: number;
  currentStep: number;
  totalSteps: number;
}

export interface DiffOptions {
  includeSemantic?: boolean;
  includeStructural?: boolean;
  similarityThreshold?: number;
}

export interface ReplayResult {
  trace: Trace;
  outputs: unknown[];
  duration: number;
  divergence?: DivergenceReport;
}

export interface DiffResult {
  diffs: TraceDiff[];
  statistics: DiffStatistics;
  report: string;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface TraceDiff {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, unknown>;
}

export interface DiffStatistics {
  totalDifferences: number;
  semanticChanges: number;
  structuralChanges: number;
}
