# TypeScript Development Skill

## Overview

The TypeScript Development skill encompasses best practices for writing, maintaining, and refactoring TypeScript code in the Agent Replay project.

## Core Competencies

### Type System Mastery

- Strict mode enforcement across all packages
- Advanced type utilities (Partial, Required, Pick, Omit, etc.)
- Discriminated unions for type-safe state management
- Generic types for reusable components
- Type guards and type predicates

### Code Organization

- Clear separation of concerns
- Single responsibility principle
- Dependency injection for testability
- Module boundaries and encapsulation
- Barrel exports for clean public APIs

### Error Handling

- Custom error classes with proper inheritance
- Error boundaries and recovery strategies
- Typed error handling with Result types
- Proper error propagation
- Error context preservation

## Best Practices

### Type Safety

```typescript
// ✅ Good: Explicit types, no any
interface UserConfig {
  apiKey: string;
  timeout: number;
  retries: number;
}

// ❌ Bad: Using any
interface UserConfig {
  apiKey: any;
  timeout: any;
}
```

### Async/Await

```typescript
// ✅ Good: Proper async handling
async function processTrace(traceId: string): Promise<Trace> {
  const trace = await traceStorage.load(traceId);
  return validateTrace(trace);
}

// ❌ Bad: Promise chains
function processTrace(traceId: string): Promise<Trace> {
  return traceStorage.load(traceId).then(trace => validateTrace(trace));
}
```

### Error Handling

```typescript
// ✅ Good: Custom error classes
class TraceNotFoundError extends Error {
  constructor(public traceId: string) {
    super(`Trace not found: ${traceId}`);
    this.name = 'TraceNotFoundError';
  }
}

// ❌ Bad: Generic errors
throw new Error('Trace not found');
```

## Project Standards

### File Structure

```
src/
├── types/           # Type definitions
├── interfaces/      # Interface definitions
├── utils/          # Utility functions
├── services/       # Business logic
├── errors/         # Custom error classes
└── index.ts        # Public API
```

### Naming Conventions

- PascalCase for classes, interfaces, and types
- camelCase for variables, functions, and properties
- UPPER_SNAKE_CASE for constants
- Prefix interfaces with 'I' only when necessary
- Descriptive, meaningful names

### Code Style

- 2-space indentation
- Single quotes for strings
- Semicolons required
- Trailing commas in multi-line structures
- Max line length: 100 characters

## Testing

### Unit Testing

```typescript
describe('TraceValidator', () => {
  it('should validate valid trace', () => {
    const trace = createValidTrace();
    expect(validateTrace(trace)).toBe(true);
  });

  it('should reject invalid trace', () => {
    const trace = createInvalidTrace();
    expect(() => validateTrace(trace)).toThrow(InvalidTraceError);
  });
});
```

### Type Testing

```typescript
// Test type inference
type Result = Extract<TraceEvent, { type: 'checkpoint' }>;
// Result should have the correct shape
const checkpoint: Result = {
  type: 'checkpoint',
  timestamp: 123,
  state: {},
};
```

## Performance Considerations

### Bundle Size

- Tree shaking for unused code
- Lazy loading for large modules
- Minimal dependencies
- Efficient imports

### Runtime Performance

- Avoid unnecessary type conversions
- Use appropriate data structures
- Optimize hot paths
- Profile before optimizing

## Security

### Input Validation

```typescript
// Validate all external inputs
function validateTraceInput(input: unknown): TraceInput {
  if (!isValidTraceInput(input)) {
    throw new InvalidInputError('Invalid trace input');
  }
  return input as TraceInput;
}
```

### Type Safety as Security

- Use branded types for sensitive data
- Prevent type confusion attacks
- Validate JSON parsing results
- Sanitize user-provided types

## Tools and Configuration

### ESLint Configuration

```javascript
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking"
  ],
  "parserOptions": {
    "project": "./tsconfig.json"
  },
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "module": "ESNext",
    "target": "ES2020",
    "lib": ["ES2020"],
    "moduleResolution": "node",
    "declaration": true,
    "sourceMap": true
  }
}
```

## Continuous Learning

### Stay Updated

- Follow TypeScript release notes
- Review RFC proposals
- Participate in community discussions
- Contribute to open source

### Skill Development

- Practice advanced type patterns
- Learn from code reviews
- Study well-typed codebases
- Experiment with new features

## Resources

### Documentation

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)
- [Effective TypeScript](https://effectivetypescript.com/)

### Community

- [TypeScript Discord](https://discord.gg/typescript)
- [Stack Overflow TypeScript Tag](https://stackoverflow.com/questions/tagged/typescript)
- [TypeScript GitHub Discussions](https://github.com/microsoft/TypeScript/discussions)

---

**Maintained by**: @reaatech and contributors  
**Last Updated**: 2026-04-22
