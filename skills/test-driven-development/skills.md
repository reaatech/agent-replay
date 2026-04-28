# Test-Driven Development Skill

## Overview

The Test-Driven Development (TDD) skill encompasses the practice of writing tests before implementation, ensuring high code quality, maintainability, and confidence in the Agent Replay codebase.

## Core Principles

### Red-Green-Refactor Cycle

1. **Red**: Write a failing test that defines desired behavior
2. **Green**: Write minimal code to make the test pass
3. **Refactor**: Improve code structure while keeping tests green

### Test First Mindset

- Write tests before implementation
- Tests define the contract and expected behavior
- Implementation is driven by test requirements
- Refactoring is safe with comprehensive test coverage

## Testing Pyramid

### Unit Tests (Base)

- Fast, isolated, and numerous
- Test individual functions and classes
- Mock external dependencies
- Coverage target: >90%

```typescript
describe('TraceBuilder', () => {
  it('should create empty trace with metadata', () => {
    const builder = new TraceBuilder();
    const trace = builder.create({ name: 'test' });

    expect(trace.metadata.name).toBe('test');
    expect(trace.spans).toHaveLength(0);
    expect(trace.version).toBeDefined();
  });
});
```

### Integration Tests (Middle)

- Test component interactions
- Verify data flow between modules
- Use real or mocked external services
- Focus on critical paths

```typescript
describe('RecordingEngine Integration', () => {
  it('should record and replay LLM calls', async () => {
    const engine = new RecordingEngine(mockStorage);

    // Record
    const session = await engine.startRecording(config);
    await simulateAgentInteraction(session);
    const trace = await engine.stopRecording(session);

    // Replay
    const replayEngine = new ReplayEngine(mockStorage);
    const result = await replayEngine.replay(trace, { mode: 'stubbed' });

    expect(result.outputs).toEqual(expectedOutputs);
  });
});
```

### E2E Tests (Top)

- Test complete user workflows
- Simulate real-world scenarios
- Slower but essential for confidence
- Focus on happy paths and critical edge cases

```typescript
describe('Agent Replay E2E', () => {
  it('should complete full recording and replay workflow', async () => {
    // Setup real agent with interceptors
    const agent = createTestAgent({ interceptors: true });

    // Record interaction
    const recorder = await agent.startRecording();
    await agent.run('Test prompt');
    const trace = await recorder.stop();

    // Verify trace structure
    expect(trace.spans.length).toBeGreaterThan(0);
    expect(trace.metadata.createdAt).toBeDefined();

    // Replay and verify determinism
    const replayed = await agent.replay(trace);
    expect(replayed.outputs).toEqual(agent.outputs);
  });
});
```

## Best Practices

### Test Structure (Arrange-Act-Assert)

```typescript
it('should calculate trace statistics correctly', () => {
  // Arrange
  const trace = createTraceWithSpans([
    { kind: 'llm_call', duration: 1000 },
    { kind: 'tool_call', duration: 500 },
  ]);

  // Act
  const stats = calculateTraceStats(trace);

  // Assert
  expect(stats.totalDuration).toBe(1500);
  expect(stats.spanCount).toBe(2);
  expect(stats.llmCallCount).toBe(1);
});
```

### Test Naming

```typescript
// ✅ Good: Descriptive names
describe('ReplayEngine', () => {
  it('should replay trace with stubbed LLM responses', () => {});
  it('should detect divergence in partial replay mode', () => {});
  it('should throw TraceNotFoundError for missing trace', () => {});
});

// ❌ Bad: Vague names
describe('Tests', () => {
  it('should work', () => {});
  it('handles stuff', () => {});
});
```

### Test Isolation

```typescript
// ✅ Good: Isolated tests with cleanup
describe('TraceStorage', () => {
  let storage: TraceStorage;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDirectory();
    storage = new FileStorage(tempDir);
  });

  afterEach(async () => {
    await removeDirectory(tempDir);
  });

  it('should save and load trace', async () => {
    const trace = createTestTrace();
    await storage.save(trace);
    const loaded = await storage.load(trace.metadata.id);
    expect(loaded).toEqual(trace);
  });
});
```

### Mock External Dependencies

```typescript
// ✅ Good: Mock LLM API calls
const mockLLMClient = {
  chat: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Test response' } }],
  }),
};

it('should handle LLM API errors gracefully', async () => {
  mockLLMClient.chat.mockRejectedValue(new Error('API Error'));

  await expect(agent.run('prompt')).rejects.toThrow('API Error');
});
```

## Vitest Configuration

### Project Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        global: {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
      },
    },
    setupFiles: ['./tests/setup.ts'],
    mockReset: true,
    clearMocks: true,
  },
});
```

### Test Utilities

```typescript
// tests/test-utils.ts
export function createTestTrace(overrides?: Partial<Trace>): Trace {
  return {
    version: '1.0.0',
    metadata: {
      id: 'test-trace-123',
      name: 'Test Trace',
      createdAt: Date.now(),
      agentVersion: '1.0.0',
      environment: { node: '18.0.0' },
      tags: ['test'],
      summary: { spanCount: 0, duration: 0 },
    },
    spans: [],
    checkpoints: [],
    indexes: { byId: {}, byKind: {} },
    ...overrides,
  };
}

export function createMockStorage(): TraceStorage {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    load: vi
      .fn()
      .mockImplementation((id: string) => Promise.resolve(createTestTrace({ metadata: { id } }))),
    list: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue({ results: [], total: 0 }),
  };
}
```

## Testing Patterns

### Snapshot Testing

```typescript
it('should generate correct trace structure', () => {
  const trace = createComplexTrace();

  // Snapshot the structure
  expect(trace).toMatchSnapshot({
    metadata: {
      id: expect.any(String),
      createdAt: expect.any(Number),
    },
  });
});
```

### Property-Based Testing

```typescript
import fc from 'fast-check';

it('should maintain trace invariants', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          kind: fc.oneof(
            fc.constant('llm_call'),
            fc.constant('tool_call'),
            fc.constant('agent_step')
          ),
          duration: fc.integer({ min: 0, max: 10000 }),
        })
      ),
      spans => {
        const trace = createTraceWithSpans(spans);
        const stats = calculateTraceStats(trace);

        // Invariant: total duration equals sum of span durations
        expect(stats.totalDuration).toBe(spans.reduce((sum, span) => sum + span.duration, 0));
      }
    )
  );
});
```

### Testing Async Code

```typescript
it('should handle concurrent trace operations', async () => {
  const engine = new ConcurrentReplayEngine();

  // Use Promise.all for concurrent operations
  const results = await Promise.all([
    engine.replay(trace1, config),
    engine.replay(trace2, config),
    engine.replay(trace3, config),
  ]);

  expect(results).toHaveLength(3);
  results.forEach(result => {
    expect(result.status).toBe('success');
  });
});
```

## Test Data Management

### Factories

```typescript
// tests/factories/trace.factory.ts
export class TraceFactory {
  static create(overrides?: Partial<Trace>): Trace {
    return {
      version: '1.0.0',
      metadata: this.createMetadata(),
      spans: [],
      checkpoints: [],
      indexes: { byId: {}, byKind: {} },
      ...overrides,
    };
  }

  static createMetadata(overrides?: Partial<TraceMetadata>): TraceMetadata {
    return {
      id: `trace-${Date.now()}`,
      name: 'Test Trace',
      createdAt: Date.now(),
      agentVersion: '1.0.0',
      environment: { node: process.version },
      tags: ['test'],
      summary: { spanCount: 0, duration: 0 },
      ...overrides,
    };
  }
}
```

### Fixtures

```typescript
// tests/fixtures/traces/complex-trace.json
{
  "version": "1.0.0",
  "metadata": {
    "id": "fixture-complex-trace",
    "name": "Complex Trace Fixture",
    "createdAt": 1234567890,
    "agentVersion": "1.0.0",
    "environment": { "node": "18.0.0" },
    "tags": ["fixture", "complex"],
    "summary": { "spanCount": 5, "duration": 5000 }
  },
  "spans": [
    {
      "id": "span-1",
      "name": "LLM Call",
      "kind": "llm_call",
      "startTime": 1234567890,
      "endTime": 1234567891,
      "status": "ok",
      "events": [],
      "attributes": {}
    }
  ],
  "checkpoints": [],
  "indexes": { "byId": {}, "byKind": {} }
}
```

## Continuous Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
      - uses: actions/checkout@v3
      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}

      - name: Install dependencies
        run: pnpm install

      - name: Run tests
        run: pnpm test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

## Performance Testing

### Benchmark Tests

```typescript
import { bench, describe } from 'vitest';

describe('Trace Processing Performance', () => {
  const largeTrace = createLargeTrace(10000);

  bench(
    'process large trace',
    async () => {
      await processTrace(largeTrace);
    },
    {
      iterations: 10,
      warmup: true,
    }
  );

  bench(
    'stream process large trace',
    async () => {
      await streamProcessTrace(largeTrace);
    },
    {
      iterations: 10,
      warmup: true,
    }
  );
});
```

## Resources

### Documentation

- [Vitest Documentation](https://vitest.dev/)
- [Testing JavaScript](https://testingjavascript.com/)
- [Node.js Testing Best Practices](https://github.com/goldbergyoni/nodebestpractices)

### Tools

- Vitest - Fast unit test framework
- Playwright - E2E testing
- @testing-library - Testing utilities
- fast-check - Property-based testing

---

**Maintained by**: @reaatech and contributors  
**Last Updated**: 2026-04-22
