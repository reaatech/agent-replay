# Docker Containerization Skill

## Overview

This skill covers containerizing Agent Replay components for consistent deployment across environments.

## Scope

- Multi-stage Docker builds for minimal image size
- Docker Compose for local development
- Container security (non-root users, minimal base images)
- Kubernetes deployment manifests (future)

## Standards

- Base image: `node:20-alpine`
- Non-root user (`nodejs`, UID 1001)
- Health checks on all services
- Multi-stage builds to separate build and runtime artifacts

## Resources

- [Docker Node.js Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
- [OCI Image Spec](https://github.com/opencontainers/image-spec)

---

**Maintained by**: @reaatech and contributors  
**Last Updated**: 2026-04-23
