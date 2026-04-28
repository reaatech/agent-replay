# CI/CD Pipeline Skill

## Overview

The CI/CD Pipeline skill focuses on automating the build, test, and deployment processes for Agent Replay, ensuring reliable and consistent delivery of high-quality software.

## Core Principles

### 1. Automation First

- Automate all repetitive tasks
- Minimize manual intervention
- Self-service deployments
- Automated rollback capabilities

### 2. Fast Feedback

- Quick build times
- Parallel test execution
- Early failure detection
- Clear error messages

### 3. Consistency

- Reproducible builds
- Environment parity
- Version-controlled pipelines
- Immutable artifacts

## Pipeline Architecture

### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  # 1. Lint and Type Check
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: |
            node_modules
            */*/node_modules
            pnpm-store
          key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run linter
        run: pnpm lint

      - name: Type check
        run: pnpm type-check

  # 2. Unit Tests
  unit-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x]
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - name: Install pnpm
        uses: pnpm/action-setup@v2

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run unit tests
        run: pnpm test:unit

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
          flags: unit-tests

  # 3. Integration Tests
  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        uses: pnpm/action-setup@v2

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run integration tests
        run: pnpm test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres

  # 4. Build
  build:
    needs: [lint-and-type-check, unit-tests]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        uses: pnpm/action-setup@v2

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build packages
        run: pnpm build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v3
        with:
          name: build-artifacts
          path: packages/*/dist

  # 5. Security Scan
  security-scan:
    needs: [build]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Snyk security scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

      - name: Run npm audit
        run: npm audit --audit-level=high

  # 6. Deploy to Staging
  deploy-staging:
    needs: [build, integration-tests, security-scan]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    environment:
      name: staging
      url: https://staging.agent-replay.dev
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to staging
        run: ./scripts/deploy.sh staging
        env:
          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}

  # 7. Deploy to Production
  deploy-production:
    needs: [deploy-staging]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: https://agent-replay.dev
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to production
        run: ./scripts/deploy.sh production
        env:
          DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
```

### Release Workflow

```yaml
# .github/workflows/release.yml
name: Release

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release (patch, minor, major)'
        required: true
        default: 'patch'
        type: choice
        options:
          - patch
          - minor
          - major

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Install pnpm
        uses: pnpm/action-setup@v2

      - name: Configure git
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm build

      - name: Run tests
        run: pnpm test

      - name: Update version
        run: pnpm version ${{ github.event.inputs.version }} --workspaces --no-git-tag-version

      - name: Create release commit
        run: |
          git add .
          git commit -m "chore: release v$(cat package.json | jq -r .version)"
          git tag -a "v$(cat package.json | jq -r .version)" -m "Release v$(cat package.json | jq -r .version)"

      - name: Push changes
        run: git push origin main --follow-tags

      - name: Publish to npm
        run: pnpm publish -r --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub Release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: v${{ github.event.inputs.version }}
          release_name: Release v${{ github.event.inputs.version }}
          draft: false
          prerelease: false
```

## Build Optimization

### Monorepo Build Strategy

```typescript
// build.config.ts
export const buildConfig = {
  // Build only changed packages
  incremental: true,

  // Parallel builds
  parallel: true,
  maxParallel: 4,

  // Cache build artifacts
  cache: {
    enabled: true,
    path: '.build-cache',
    ttl: 7 * 24 * 60 * 60, // 7 days
  },

  // Package build order
  buildOrder: ['shared', ['core', 'interceptors'], ['cli', 'web-ui', 'integrations']],
};
```

### Docker Build Optimization

```dockerfile
# Dockerfile
# Multi-stage build for minimal image size
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build
RUN pnpm build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/packages/*/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node dist/health-check.js

CMD ["node", "dist/index.js"]
```

## Testing Strategy

### Test Matrix

```yaml
# .github/workflows/test-matrix.yml
name: Test Matrix

on: [push, pull_request]

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: [18.x, 20.x, 22.x]
        package: [core, interceptors, cli, web-ui]

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - name: Install pnpm
        uses: pnpm/action-setup@v2

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Test ${{ matrix.package }}
        run: pnpm --filter @reaatech/${{ matrix.package }} test
```

### Performance Testing

```yaml
# .github/workflows/performance.yml
name: Performance Tests

on:
  pull_request:
    branches: [main]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install

      - name: Run performance benchmarks
        run: pnpm test:performance

      - name: Compare with baseline
        uses: benchmark-action/github-action-benchmark@v1
        with:
          name: Performance Benchmarks
          tool: 'benchmark.js'
          output-file-path: benchmarks/output.json
          external-data-json-path: benchmarks/baseline.json
          fail-on-alert: true
```

## Deployment Strategies

### Blue-Green Deployment

```yaml
# .github/workflows/deploy-blue-green.yml
name: Blue-Green Deployment

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to green environment
        run: |
          ./scripts/deploy.sh green
          ./scripts/health-check.sh green

      - name: Switch traffic to green
        run: ./scripts/switch-traffic.sh green

      - name: Verify deployment
        run: ./scripts/verify-deployment.sh

      - name: Terminate blue environment
        run: ./scripts/terminate.sh blue
```

### Canary Deployment

```yaml
# .github/workflows/deploy-canary.yml
name: Canary Deployment

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy canary (5% traffic)
        run: |
          ./scripts/deploy-canary.sh 5
          ./scripts/health-check.sh canary

      - name: Monitor canary
        run: ./scripts/monitor-canary.sh

      - name: Gradually increase traffic
        run: |
          ./scripts/increase-traffic.sh 25
          sleep 300
          ./scripts/increase-traffic.sh 50
          sleep 300
          ./scripts/increase-traffic.sh 100
```

## Monitoring and Alerting

### Pipeline Metrics

```typescript
// monitoring/pipeline-metrics.ts
interface PipelineMetrics {
  buildTime: number;
  testDuration: number;
  testCoverage: number;
  deploymentTime: number;
  successRate: number;
  failureReasons: Map<string, number>;
}

class PipelineMonitor {
  async collectMetrics(workflowRun: WorkflowRun): Promise<PipelineMetrics> {
    return {
      buildTime: workflowRun.buildDuration,
      testDuration: workflowRun.testDuration,
      testCoverage: await this.getCoverage(),
      deploymentTime: workflowRun.deploymentDuration,
      successRate: await this.getSuccessRate(),
      failureReasons: await this.analyzeFailures(),
    };
  }

  async alertOnDegradation(metrics: PipelineMetrics) {
    if (metrics.buildTime > 10 * 60 * 1000) {
      // 10 minutes
      await this.sendAlert('Build time exceeded threshold');
    }

    if (metrics.testCoverage < 90) {
      await this.sendAlert('Test coverage below 90%');
    }
  }
}
```

## Best Practices

### 1. Pipeline as Code

- Version control all pipeline configurations
- Review pipeline changes like code
- Test pipeline changes in isolation
- Document pipeline behavior

### 2. Security

- Use OIDC for cloud authentication
- Store secrets in secure vaults
- Scan dependencies for vulnerabilities
- Implement least privilege access

### 3. Reliability

- Implement retry logic for flaky tests
- Use timeouts for all operations
- Implement circuit breakers
- Monitor pipeline health

### 4. Performance

- Cache dependencies aggressively
- Parallelize independent jobs
- Use self-hosted runners for speed
- Optimize Docker layer caching

## Resources

### Documentation

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Continuous Delivery Foundation](https://cd.foundation/)
- [DevOps Research and Assessment](https://www.devops-research.com/)

### Tools

- GitHub Actions - CI/CD platform
- ArgoCD - GitOps continuous delivery
- Terraform - Infrastructure as code
- Prometheus - Monitoring and alerting

---

**Maintained by**: @reaatech and contributors  
**Last Updated**: 2026-04-22
