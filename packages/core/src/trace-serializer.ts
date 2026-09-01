import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createGunzip, createGzip } from 'node:zlib';

import type { Checkpoint, Span, Trace, TraceHeader } from '@reaatech/agent-replay-shared';

function parseSpan(raw: Record<string, unknown>): Span {
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.kind !== 'string') {
    throw new Error('Invalid span in trace file');
  }
  return raw as unknown as Span;
}

function parseCheckpoint(raw: Record<string, unknown>): Checkpoint {
  if (typeof raw.id !== 'string' || typeof raw.spanId !== 'string') {
    throw new Error('Invalid checkpoint in trace file');
  }
  return raw as unknown as Checkpoint;
}

function parseTraceHeader(raw: Record<string, unknown>): TraceHeader {
  if (typeof raw.version !== 'string' || typeof raw.format !== 'string') {
    throw new Error('Invalid trace header');
  }
  return raw as unknown as TraceHeader;
}

/**
 * Serializes traces to `.artrace.json` files using line-delimited JSON.
 *
 * Format:
 *   Line 1: TraceHeader (JSON)
 *   Lines 2..N: Span | Checkpoint (JSON, in chronological order)
 *   Last line: TraceFooter with indexes and summary
 */
export class TraceSerializer {
  async serialize(trace: Trace, path: string, options?: { compress?: boolean }): Promise<void> {
    await mkdir(dirname(path), { recursive: true });

    const header: TraceHeader = {
      version: trace.version,
      format: 'artrace-json-v1',
      metadata: trace.metadata,
      schema: {
        spanKinds: [
          'llm_call',
          'tool_call',
          'agent_step',
          'routing_decision',
          'state_change',
          'error',
        ],
        eventTypes: ['request', 'response', 'error', 'state_snapshot', 'checkpoint', 'annotation'],
        compression: options?.compress ? 'gzip' : 'none',
      },
    };

    const lines: string[] = [JSON.stringify(header)];

    // Interleave spans and checkpoints by timestamp
    const checkpointsBySpanId = new Map<string, Checkpoint[]>();
    for (const cp of trace.checkpoints) {
      const list = checkpointsBySpanId.get(cp.spanId) ?? [];
      list.push(cp);
      checkpointsBySpanId.set(cp.spanId, list);
    }

    for (const span of trace.spans) {
      lines.push(JSON.stringify({ _kind: 'span', ...span }));

      const checkpoints = checkpointsBySpanId.get(span.id);
      if (checkpoints) {
        for (const cp of checkpoints) {
          lines.push(JSON.stringify({ _kind: 'checkpoint', ...cp }));
        }
      }
    }

    const footer = {
      kind: 'footer',
      indexes: trace.indexes,
      summary: trace.metadata.summary,
    };
    lines.push(JSON.stringify(footer));

    const data = lines.join('\n');

    if (options?.compress) {
      const compressed = createGzip();
      const writeStream = createWriteStream(path);
      compressed.pipe(writeStream);
      compressed.write(data);
      compressed.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
    } else {
      const writeStream = createWriteStream(path);
      writeStream.write(data);
      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
    }
  }

  async deserialize(path: string): Promise<Trace> {
    const isCompressed = path.endsWith('.gz');
    const readStream = createReadStream(path);
    const gunzip = isCompressed ? createGunzip() : undefined;

    const chunks: Buffer[] = [];
    const stream = gunzip ? readStream.pipe(gunzip) : readStream;

    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }

    const data = Buffer.concat(chunks).toString('utf-8');
    const lines = data.split('\n').filter((line) => line.trim());

    if (lines.length === 0) {
      throw new Error('Empty trace file');
    }

    const header = parseTraceHeader(JSON.parse(lines[0]) as Record<string, unknown>);
    const spans: Span[] = [];
    const checkpoints: Checkpoint[] = [];

    for (let i = 1; i < lines.length - 1; i++) {
      const line = JSON.parse(lines[i]) as Record<string, unknown>;
      if (line._kind === 'span') {
        const { _kind, ...span } = line;
        spans.push(parseSpan(span));
      } else if (line._kind === 'checkpoint') {
        const { _kind, ...checkpoint } = line;
        checkpoints.push(parseCheckpoint(checkpoint));
      }
    }

    const footer = JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;
    const indexes = (footer.indexes as Trace['indexes']) ?? { byId: {}, byKind: {} };

    return {
      version: header.version,
      metadata: header.metadata,
      spans,
      checkpoints,
      indexes,
    };
  }

  /**
   * Streams a trace file without loading it entirely into memory.
   * Yields spans and checkpoints one at a time.
   */
  async *streamDeserialize(path: string): AsyncGenerator<Span | Checkpoint | TraceHeader> {
    if (!existsSync(path)) {
      throw new Error(`Trace file not found: ${path}`);
    }

    const isCompressed = path.endsWith('.gz');
    const readStream = createReadStream(path);
    const gunzip = isCompressed ? createGunzip() : undefined;
    const stream = gunzip ? readStream.pipe(gunzip) : readStream;

    let buffer = '';

    for await (const chunk of stream) {
      buffer += (chunk as Buffer).toString('utf-8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line) as Record<string, unknown>;

        if (parsed._kind === 'span') {
          const { _kind, ...span } = parsed;
          yield parseSpan(span);
        } else if (parsed._kind === 'checkpoint') {
          const { _kind, ...checkpoint } = parsed;
          yield parseCheckpoint(checkpoint);
        } else if (parsed._kind === undefined) {
          // Header line
          yield parseTraceHeader(parsed);
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const parsed = JSON.parse(buffer) as Record<string, unknown>;
      if (parsed._kind === 'span') {
        const { _kind, ...span } = parsed;
        yield parseSpan(span);
      } else if (parsed._kind === 'checkpoint') {
        const { _kind, ...checkpoint } = parsed;
        yield parseCheckpoint(checkpoint);
      }
    }
  }
}

/**
 * Utility for migrating trace formats between versions.
 */
export const CURRENT_TRACE_VERSION = '1.0.0';

export function migrateTrace(trace: Trace): Trace {
  if (trace.version === CURRENT_TRACE_VERSION) {
    return trace;
  }

  if (!trace.version) {
    return {
      ...trace,
      version: CURRENT_TRACE_VERSION,
    };
  }

  throw new Error(`Unsupported trace version: ${trace.version}`);
}

export function validateTraceVersion(header: TraceHeader): void {
  const [major] = header.version.split('.');
  const [currentMajor] = CURRENT_TRACE_VERSION.split('.');

  if (major !== currentMajor) {
    throw new Error(
      `Trace version ${header.version} is incompatible with current version ${CURRENT_TRACE_VERSION}`,
    );
  }
}
