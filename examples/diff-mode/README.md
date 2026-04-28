# Diff Mode Example

This example shows how to compare a recorded trace against a live execution.

## Usage

```typescript
import { SemanticDiffEngine, RegressionDetector } from '@reaatech/core';

const diffEngine = new SemanticDiffEngine();
const result = diffEngine.compare(baselineTrace, currentTrace);

console.log(`Similarity: ${(result.overallSimilarity * 100).toFixed(1)}%`);
console.log(`Max severity: ${result.maxSeverity}`);

for (const diff of result.differences) {
  console.log(`[${diff.severity}] Step ${diff.step}: ${diff.message}`);
}
```

## Running

```bash
npx tsx example.ts
```
