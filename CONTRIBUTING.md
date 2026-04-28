# Contributing to Agent Replay

Thank you for your interest in contributing to Agent Replay! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [How to Contribute](#how-to-contribute)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Submitting Changes](#submitting-changes)
- [Community](#community)

## Code of Conduct

Please be respectful and constructive in your interactions. We are committed to providing a welcoming and inclusive experience for everyone.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (package manager)
- Git

### Setting Up Development Environment

1. **Fork the repository**

   ```bash
   gh repo fork reaatech/agent-replay
   ```

2. **Clone your fork**

   ```bash
   git clone https://github.com/your-username/agent-replay.git
   cd agent-replay
   ```

3. **Install dependencies**

   ```bash
   pnpm install
   ```

4. **Build all packages**

   ```bash
   pnpm build
   ```

5. **Run tests**
   ```bash
   pnpm test
   ```

## Development Workflow

### Branch Naming Convention

Use descriptive branch names following this pattern:

- `feat/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code refactoring
- `test/description` - Test additions/changes
- `chore/description` - Maintenance tasks

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Example:**

```
feat(core): add partial replay checkpoint system

Implement checkpoint creation and restoration for partial replay functionality.
- Add Checkpoint interface and serialization
- Implement state capture at arbitrary trace positions
- Add checkpoint indexing for efficient lookup

Closes #123
```

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues. When creating a bug report, include:

- Clear and descriptive title
- Detailed description of the issue
- Steps to reproduce the behavior
- Expected vs actual behavior
- Screenshots if applicable
- Environment details (OS, Node.js version, etc.)

**Example:**

```markdown
**Bug**: Replay fails when trace contains async tool calls

**Steps to Reproduce:**

1. Record a trace with async tool calls
2. Attempt to replay with `--mode stubbed`
3. Observe error in console

**Expected:** Trace should replay successfully
**Actual:** Error: "Cannot replay async tool call"

**Environment:**

- OS: macOS 14.0
- Node.js: 18.17.0
- agent-replay: 0.1.0
```

### Suggesting Features

Feature suggestions are welcome! Please provide:

- Use case and motivation
- Proposed solution
- Examples of how it would be used
- Any potential drawbacks or alternatives

### Pull Requests

1. Ensure your code follows the project's coding standards
2. Write or update tests as needed
3. Update documentation if necessary
4. Ensure all tests pass
5. Provide a clear description of changes

## Coding Standards

### TypeScript

- Enable strict mode for all packages
- Avoid `any` type unless absolutely necessary
- Use comprehensive type definitions
- Implement proper error handling with custom error classes
- Use async/await for asynchronous operations

### Code Style

The project uses Prettier for formatting and ESLint for linting:

```bash
# Format code
pnpm format

# Run linter
pnpm lint
```

### File Organization

- Keep files focused and modular
- Group related functionality together
- Follow the established directory structure
- Use meaningful file names

## Testing

### Test Coverage Requirements

- Minimum 90% test coverage
- Unit tests for all functions
- Integration tests for critical paths
- E2E tests for user workflows

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm test --filter @reaatech/core

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch
```

### Writing Tests

- Use Vitest for testing
- Write tests before implementation (TDD)
- Test edge cases and error conditions
- Use descriptive test names
- Keep tests independent and isolated

## Documentation

### Documentation Standards

- JSDoc comments for all public APIs
- README for each package
- Usage examples for complex features
- Migration guides for breaking changes
- API reference documentation

### Updating Documentation

When making changes:

1. Update relevant README files
2. Add JSDoc comments for new APIs
3. Update examples if behavior changes
4. Document breaking changes in migration guide
5. Update inline code comments as needed

## Submitting Changes

### Pull Request Process

1. **Create a feature branch** from `main`

   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** following the coding standards

3. **Test your changes**

   ```bash
   pnpm test
   pnpm build
   pnpm lint
   pnpm format
   ```

4. **Commit your changes** with a conventional commit message

5. **Push to your fork**

   ```bash
   git push origin feat/your-feature-name
   ```

6. **Create a Pull Request**
   - Use a clear and descriptive title
   - Reference related issues
   - Provide a detailed description
   - Include test results
   - Add screenshots for UI changes

### Review Process

1. All PRs require at least one maintainer review
2. Address review feedback promptly
3. Ensure CI/CD pipeline passes
4. Maintain a clean commit history

### Merging

- PRs are typically squashed and merged
- Ensure commit message follows conventions
- Delete feature branch after merging

## Community

### Getting Help

- Check existing documentation
- Search GitHub issues
- Ask in GitHub discussions
- Contact maintainers

### Communication

- Be respectful and professional
- Provide constructive feedback
- Help others when possible
- Share knowledge freely

## License

By contributing to Agent Replay, you agree that your contributions will be licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.

## Acknowledgments

Thank you to all our contributors! Agent Replay is built with ❤️ by @reaatech and the community.
