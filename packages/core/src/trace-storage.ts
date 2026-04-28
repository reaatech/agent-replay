import { readFile, writeFile, mkdir, access, readdir, unlink } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';

import {
  type Trace,
  type TraceStorage,
  type StorageOptions,
  type TraceFilter,
  type SearchQuery,
  type TraceSearchResult,
  type TraceSummary,
  TraceNotFoundError,
} from '@reaatech/shared';

export class LocalFileStorage implements TraceStorage {
  private basePath: string;

  constructor(basePath = './traces') {
    this.basePath = basePath;
  }

  async save(trace: Trace, options?: StorageOptions): Promise<string> {
    const path = this.getPath(trace.metadata.id);
    await mkdir(dirname(path), { recursive: true });

    let data = JSON.stringify(trace);
    if (options?.compress) {
      const { gzip } = await import('node:zlib');
      const { promisify } = await import('node:util');
      const gzipAsync = promisify(gzip);
      data = (await gzipAsync(Buffer.from(data))).toString('base64');
    }

    await writeFile(path, data, 'utf-8');
    return path;
  }

  async load(id: string, options?: StorageOptions): Promise<Trace> {
    const path = this.getPath(id);
    try {
      await access(path);
    } catch {
      throw new TraceNotFoundError(id);
    }

    let data = await readFile(path, 'utf-8');
    if (options?.compress) {
      const { gunzip } = await import('node:zlib');
      const { promisify } = await import('node:util');
      const gunzipAsync = promisify(gunzip);
      data = (await gunzipAsync(Buffer.from(data, 'base64'))).toString('utf-8');
    }

    return JSON.parse(data) as Trace;
  }

  async list(filter?: TraceFilter): Promise<TraceSummary[]> {
    const files = await readdir(this.basePath).catch(() => []);
    const summaries: TraceSummary[] = [];

    for (const file of files) {
      if (!file.endsWith('.artrace.json')) continue;
      try {
        const trace = await this.load(basename(file, '.artrace.json'));
        if (this.matchesFilter(trace, filter)) {
          summaries.push({
            id: trace.metadata.id,
            name: trace.metadata.name,
            spanCount: trace.metadata.summary.spanCount,
            duration: trace.metadata.summary.duration,
          });
        }
      } catch {
        // Skip unreadable files
      }
    }

    return summaries;
  }

  async delete(id: string): Promise<void> {
    const path = this.getPath(id);
    try {
      await access(path);
    } catch {
      throw new TraceNotFoundError(id);
    }
    await unlink(path);
  }

  async search(query: SearchQuery): Promise<TraceSearchResult> {
    const files = await readdir(this.basePath).catch(() => []);
    const results: TraceSummary[] = [];
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;

    for (const file of files) {
      if (!file.endsWith('.artrace.json')) continue;
      try {
        const trace = await this.load(basename(file, '.artrace.json'));
        const haystack = `${trace.metadata.name} ${trace.metadata.tags.join(' ')}`.toLowerCase();
        if (haystack.includes(query.text.toLowerCase())) {
          results.push({
            id: trace.metadata.id,
            name: trace.metadata.name,
            spanCount: trace.metadata.summary.spanCount,
            duration: trace.metadata.summary.duration,
          });
        }
      } catch {
        // Skip unreadable files
      }
    }

    return {
      results: results.slice(offset, offset + limit),
      total: results.length,
    };
  }

  private getPath(id: string): string {
    return join(this.basePath, `${id}.artrace.json`);
  }

  private matchesFilter(trace: Trace, filter?: TraceFilter): boolean {
    if (!filter) return true;
    if (filter.tags && filter.tags.length > 0) {
      if (!filter.tags.some(t => trace.metadata.tags.includes(t))) return false;
    }
    if (filter.startDate && trace.metadata.createdAt < filter.startDate) return false;
    if (filter.endDate && trace.metadata.createdAt > filter.endDate) return false;
    return true;
  }
}
