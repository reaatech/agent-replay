# Infrastructure as Code Skill

## Overview

This skill covers defining and managing infrastructure for Agent Replay deployments using code.

## Scope

- Terraform modules for cloud resources (S3, PostgreSQL, Kubernetes)
- GitHub Actions workflows for CI/CD
- Environment parity between dev, staging, and production
- Secrets management (AWS Secrets Manager, HashiCorp Vault)

## Standards

- All infrastructure defined in `infrastructure/` directory
- Use Terraform workspaces for environment separation
- State stored remotely (S3 + DynamoDB for locking)
- No secrets in code — use variable injection

## Resources

- [Terraform Best Practices](https://www.terraform-best-practices.com/)
- [GitHub Actions Security](https://docs.github.com/en/actions/security-guides)

---

**Maintained by**: @reaatech and contributors  
**Last Updated**: 2026-04-23
