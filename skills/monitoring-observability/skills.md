# Monitoring & Observability Skill

## Overview

This skill covers logging, metrics, and tracing for the Agent Replay system itself (not to be confused with the agent traces it records).

## Scope

- Structured logging (JSON format)
- Performance metrics collection
- Health checks and readiness probes
- OpenTelemetry integration (future)
- Alerting rules for production deployments

## Standards

- Use `pino` for structured logging
- Log levels: `debug`, `info`, `warn`, `error`
- Include `traceId` and `spanId` in all log entries for correlation
- Metrics: replay duration, memory usage, error rates, token savings

## Resources

- [OpenTelemetry JS](https://opentelemetry.io/docs/instrumentation/js/)
- [Pino Documentation](https://getpino.io/)

---

**Maintained by**: @reaatech and contributors  
**Last Updated**: 2026-04-23
