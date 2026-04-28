# Agent Replay - AI Agent Development Guide

## Overview

This document provides guidance for AI agents working on the Agent Replay project. It defines the skills, workflows, and best practices for developing, testing, and maintaining the codebase.

## Agent Quick Start

If you're starting work on this project for the first time:

1. **Read the context**: Start with [DEV_PLAN.md](./DEV_PLAN.md) for the roadmap, then [ARCHITECTURE.md](./ARCHITECTURE.md) for technical design.
2. **Check the skills**: Browse `skills/` for domain-specific guidance relevant to your task. These are reference docs, not auto-loaded code.
3. **Understand the monorepo**: Packages live in `packages/` (not created yet). Shared types go in `@reaatech/shared`. The core engine is `@reaatech/core`.
4. **Follow conventions**: Use the file naming, code style, and test patterns defined in this doc and in `skills/typescript-development/`.
5. **Plan before coding**: For non-trivial changes, enter plan mode, explore the codebase, and get approval before making edits.
6. **Test first**: Write tests before implementation. Run `pnpm test` frequently. Coverage target is >90%.

## Project Context

**Agent Replay** is a deterministic replay system for AI agent interactions, enabling developers to record, replay, and debug agent behaviors without consuming LLM tokens.

### Key Features

- **Record Once, Replay Infinitely**: Capture complete agent interaction traces
- **Token-Free Debugging**: Replay traces with stubbed LLM responses
- **Diff Mode**: Compare live LLM outputs against recorded traces
- **Partial Replay**: Replay up to step N, then go live for debugging

### Technology Stack

- **Language**: TypeScript 5.x
- **Runtime**: Node.js 18+
- **Package Manager**: pnpm
- **Testing**: Vitest
- **Build**: tsup, esbuild
- **Monorepo**: pnpm workspaces

### Package Naming

All packages are published under the `@reaatech/` scope:

| Package                  | Path                    | Description                                  |
| ------------------------ | ----------------------- | -------------------------------------------- |
| `@reaatech/agent-replay` | `packages/core`         | Main package, re-exports core + interceptors |
| `@reaatech/core`         | `packages/core`         | Recording/replay engine                      |
| `@reaatech/interceptors` | `packages/interceptors` | LLM provider interceptors                    |
| `@reaatech/cli`          | `packages/cli`          | Command-line interface                       |
| `@reaatech/web-ui`       | `packages/web-ui`       | Web-based trace viewer                       |
| `@reaatech/integrations` | `packages/integrations` | Framework integrations                       |
| `@reaatech/shared`       | `packages/shared`       | Shared types and utilities                   |

Internal code should use workspace-relative imports (e.g., `@reaatech/shared`). External consumers import `@reaatech/agent-replay`.

### Repository Structure

**Current structure** (pre-development):

```
agent-replay/
├── skills/             # Agent skills documentation
├── AGENTS.md           # This file
├── ARCHITECTURE.md     # Technical architecture
├── DEV_PLAN.md         # Development roadmap
├── LICENSE             # MIT License
└── (packages/ will be created during Phase 1)
```

**Planned structure** (after Phase 1):

```
agent-replay/
├── packages/
│   ├── core/           # Core recording/replay engine
│   ├── interceptors/   # LLM provider interceptors
│   ├── cli/            # Command-line interface
│   ├── web-ui/         # Web-based trace viewer
│   ├── integrations/   # Framework integrations
│   └── shared/         # Shared types and utilities
├── skills/             # Agent skills documentation
├── examples/           # Example implementations
├── docs/               # Documentation
└── tests/              # Integration and E2E tests
```

## Agent Skills

The `skills/` directory contains reference documentation for specific capabilities. When working on a task, read the relevant skill file for patterns, examples, and best practices. Skills are not code — they are guides for humans and agents.

### Core Development Skills

| Skill                      | Status | Description                            |
| -------------------------- | ------ | -------------------------------------- |
| `typescript-development`   | ✅     | TypeScript coding and refactoring      |
| `test-driven-development`  | ✅     | Writing tests and TDD workflows        |
| `api-design`               | ✅     | Designing clean, maintainable APIs     |
| `performance-optimization` | ✅     | Optimizing code performance            |
| `security-review`          | ✅     | Security analysis and hardening        |
| `code-review`              | ✅     | Comprehensive code review and feedback |
| `documentation`            | ✅     | Technical writing and documentation    |

### Infrastructure Skills

| Skill                      | Status | Description                              |
| -------------------------- | ------ | ---------------------------------------- |
| `ci-cd-pipeline`           | ✅     | GitHub Actions and deployment automation |
| `docker-containerization`  | ✅     | Container development and optimization   |
| `monitoring-observability` | ✅     | Logging, metrics, and tracing            |
| `infrastructure-as-code`   | ✅     | Terraform and infrastructure management  |

### Specialized Agent Skills

| Skill              | Status | Description                                    |
| ------------------ | ------ | ---------------------------------------------- |
| `llm-integration`  | ✅     | LLM API integration and optimization           |
| `trace-analysis`   | ✅     | Analyzing and debugging agent traces           |
| `replay-debugging` | ✅     | Debugging with deterministic replay            |
| `diff-analysis`    | ✅     | Comparing and analyzing behavioral differences |

### Quality Assurance Skills

| Skill                  | Status | Description                               |
| ---------------------- | ------ | ----------------------------------------- |
| `accessibility`        | ✅     | WCAG compliance and accessibility testing |
| `internationalization` | ✅     | i18n implementation and localization      |

## Development Workflows

### Feature Development Workflow

1. **Planning Phase**
   - Review requirements and acceptance criteria
   - Design solution architecture
   - Identify potential risks and mitigation strategies
   - Create detailed implementation plan

2. **Implementation Phase**
   - Set up development environment
   - Write tests first (TDD approach)
   - Implement feature incrementally
   - Run tests frequently
   - Refactor for code quality

3. **Review Phase**
   - Self-review code changes
   - Run full test suite
   - Check performance benchmarks
   - Update documentation
   - Request human review

4. **Integration Phase**
   - Address review feedback
   - Merge to main branch
   - Monitor CI/CD pipeline
   - Verify deployment

### Debugging Workflow

1. **Trace Collection**
   - Enable recording for the agent
   - Reproduce the issue
   - Capture complete trace

2. **Trace Analysis**
   - Load trace in viewer
   - Identify problematic spans
   - Analyze LLM calls and responses
   - Check tool invocations

3. **Partial Replay**
   - Set checkpoint before issue
   - Replay up to checkpoint
   - Go live to observe behavior
   - Compare with recorded trace

4. **Fix and Validate**
   - Implement fix
   - Replay trace to verify fix
   - Run regression tests
   - Update tests if needed

## Code Quality Standards

### File Conventions

```
src/
├── types/           # Domain type definitions (not shared — those go in @reaatech/shared)
├── interfaces/      # Interface definitions for external contracts
├── utils/           # Pure utility functions
├── services/        # Business logic and orchestration
├── errors/          # Custom error classes
├── __tests__/       # Co-located tests (Vitest)
│   └── *.test.ts
└── index.ts         # Public API barrel export
```

- **Source files**: `camelCase.ts` for utilities, `PascalCase.ts` for classes
- **Test files**: Co-located in `__tests__/` or adjacent as `*.test.ts`
- **Barrel exports**: Every package exports its public API through `src/index.ts`
- **No `index.ts` deep imports**: Consumers import from the package root only

### TypeScript Standards

- Strict mode enabled for all packages
- No `any` type unless absolutely necessary (document exceptions with `// eslint-disable-next-line @typescript-eslint/no-explicit-any`)
- Comprehensive type definitions
- Proper error handling with custom error classes (see ARCHITECTURE.md Error Hierarchy)
- Async/await for asynchronous operations

### Testing Standards

- Minimum 90% test coverage
- Unit tests for all functions
- Integration tests for critical paths
- E2E tests for user workflows
- Performance benchmarks for key operations

### Documentation Standards

- JSDoc comments for all public APIs
- README for each package
- Usage examples for complex features
- Migration guides for breaking changes
- API reference documentation

### Security Standards

- Input validation for all external data
- Proper error handling (no information leakage)
- Secure default configurations
- Regular dependency updates
- Security scanning in CI/CD

## Communication Protocols

### Commit Messages

Follow conventional commits:

```
feat(core): add partial replay checkpoint system

Implement checkpoint creation and restoration for partial replay functionality.
- Add Checkpoint interface and serialization
- Implement state capture at arbitrary trace positions
- Add checkpoint indexing for efficient lookup

Closes #123
```

### Pull Request Guidelines

- Clear title and description
- Link to related issues
- Include test results
- Add screenshots for UI changes
- Request specific reviewers

### Issue Templates

- Bug reports with reproduction steps
- Feature requests with use cases
- Performance issues with benchmarks
- Security vulnerabilities with severity

## Tool Usage

### Development Tools

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build all packages
pnpm build

# Run linter
pnpm lint

# Format code
pnpm format

# Start development server
pnpm dev
```

### Debugging Tools

```bash
# Record agent interaction
agent-replay record --output trace.json

# Replay trace
agent-replay replay --trace trace.json --mode stubbed

# Partial replay
agent-replay replay --trace trace.json --mode partial --checkpoint cp-3

# Diff mode
agent-replay replay --trace trace.json --mode diff
```

## Best Practices

### For AI Agents

1. **Always Test First**
   - Write tests before implementation
   - Run tests after each change
   - Verify edge cases

2. **Maintain Code Quality**
   - Follow TypeScript best practices
   - Keep functions small and focused
   - Use meaningful variable names
   - Add comprehensive comments

3. **Document Thoroughly**
   - Update README files
   - Add JSDoc comments
   - Include usage examples
   - Document breaking changes

4. **Consider Performance**
   - Profile before optimizing
   - Use efficient algorithms
   - Minimize memory usage
   - Optimize critical paths

5. **Prioritize Security**
   - Validate all inputs
   - Handle errors securely
   - Follow principle of least privilege
   - Keep dependencies updated

### For Human Developers

1. **Review Agent Work**
   - Check test coverage
   - Verify edge cases
   - Review security implications
   - Validate performance impact

2. **Provide Clear Guidance**
   - Write detailed requirements
   - Specify acceptance criteria
   - Provide context and background
   - Give constructive feedback

3. **Collaborate Effectively**
   - Communicate clearly
   - Ask clarifying questions
   - Share knowledge freely
   - Support continuous learning

## Resources

### Documentation

- [DEV_PLAN.md](./DEV_PLAN.md) - Development roadmap
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical architecture
- [API Reference](./docs/api) - API documentation
- [Examples](./examples) - Usage examples

### External Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Testing JavaScript](https://testingjavascript.com/)
- [Security Cheat Sheets](https://cheatsheetseries.owasp.org/)

## Support

### Getting Help

- Check existing documentation
- Search GitHub issues
- Ask in GitHub discussions
- Contact maintainers

### Contributing

- Fork the repository
- Create feature branch
- Follow development workflow
- Submit pull request

## License

MIT License - see LICENSE file for details.

## Acknowledgments

Built with ❤️ by @reaatech and contributors.
