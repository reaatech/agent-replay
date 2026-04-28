# Security Review Skill

## Overview

The Security Review skill focuses on identifying and mitigating security vulnerabilities in the Agent Replay system, ensuring data protection, access control, and secure operations.

## Core Principles

### 1. Defense in Depth

- Multiple layers of security
- Assume breach mentality
- Minimize attack surface
- Fail securely

### 2. Least Privilege

- Minimum required permissions
- Role-based access control
- Time-limited access
- Regular permission audits

### 3. Secure by Default

- Secure default configurations
- Opt-in for risky features
- Automatic security updates
- Security-first design

## Security Areas

### 1. Data Protection

#### Encryption at Rest

```typescript
// ✅ Good: Encrypt sensitive trace data
class EncryptedTraceStorage implements TraceStorage {
  private encryptionKey: Buffer;

  async save(trace: Trace): Promise<void> {
    const sensitiveData = this.extractSensitiveData(trace);
    const encrypted = await this.encrypt(sensitiveData);

    const sanitizedTrace = this.sanitizeTrace(trace);
    sanitizedTrace.metadata.encryptedFields = Object.keys(sensitiveData);

    await this.baseStorage.save(sanitizedTrace);
    await this.saveEncryptedData(trace.metadata.id, encrypted);
  }

  private async encrypt(data: Buffer): Promise<Buffer> {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final(), iv, cipher.getAuthTag()]);

    return encrypted;
  }
}
```

#### Encryption in Transit

```typescript
// ✅ Good: TLS for all network communication
class SecureTraceClient {
  private client: HTTPSClient;

  constructor(config: SecureConfig) {
    this.client = new HTTPSClient({
      rejectUnauthorized: true,
      minVersion: 'TLSv1.3',
      ca: config.caCert,
      cert: config.clientCert,
      key: config.clientKey,
    });
  }

  async uploadTrace(trace: Trace): Promise<void> {
    const encrypted = await this.encryptTrace(trace);
    await this.client.post('/traces', encrypted);
  }
}
```

### 2. Input Validation

#### Trace Validation

```typescript
// ✅ Good: Comprehensive input validation
class TraceValidator {
  private static readonly MAX_TRACE_SIZE = 100 * 1024 * 1024; // 100MB
  private static readonly ALLOWED_SPAN_KINDS = new Set([
    'llm_call',
    'tool_call',
    'agent_step',
    'routing_decision',
    'state_change',
    'error',
  ]);

  static validate(trace: Trace): ValidationResult {
    const errors: ValidationError[] = [];

    // Size validation
    if (JSON.stringify(trace).length > this.MAX_TRACE_SIZE) {
      errors.push(new ValidationError('Trace exceeds maximum size'));
    }

    // Structure validation
    if (!trace.metadata.id || !trace.metadata.version) {
      errors.push(new ValidationError('Missing required metadata fields'));
    }

    // Span validation
    trace.spans.forEach((span, index) => {
      if (!this.ALLOWED_SPAN_KINDS.has(span.kind)) {
        errors.push(new ValidationError(`Invalid span kind at index ${index}`));
      }

      if (span.attributes && JSON.stringify(span.attributes).length > 1024 * 1024) {
        errors.push(new ValidationError(`Span attributes too large at index ${index}`));
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
```

#### Sanitization

```typescript
// ✅ Good: Sanitize trace data
class TraceSanitizer {
  private static readonly SENSITIVE_PATTERNS = [
    /sk-[a-zA-Z0-9]{48}/, // OpenAI API keys
    /Bearer\s+[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/, // JWT tokens
    /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/, // Private keys
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN pattern
  ];

  static sanitize(trace: Trace): Trace {
    const sanitized = JSON.stringify(trace);

    let cleaned = sanitized;
    this.SENSITIVE_PATTERNS.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '[REDACTED]');
    });

    // Remove potential XSS in string fields
    cleaned = this.removeXSS(cleaned);

    return JSON.parse(cleaned) as Trace;
  }

  private static removeXSS(data: string): string {
    return data.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }
}
```

### 3. Access Control

#### Role-Based Access Control

```typescript
// ✅ Good: RBAC for trace access
enum Role {
  ADMIN = 'admin',
  DEVELOPER = 'developer',
  VIEWER = 'viewer',
  AUDITOR = 'auditor',
}

enum Permission {
  TRACE_CREATE = 'trace:create',
  TRACE_READ = 'trace:read',
  TRACE_UPDATE = 'trace:update',
  TRACE_DELETE = 'trace:delete',
  TRACE_SHARE = 'trace:share',
}

class AccessControl {
  private rolePermissions: Map<Role, Set<Permission>> = new Map([
    [Role.ADMIN, new Set(Object.values(Permission))],
    [
      Role.DEVELOPER,
      new Set([Permission.TRACE_CREATE, Permission.TRACE_READ, Permission.TRACE_UPDATE]),
    ],
    [Role.VIEWER, new Set([Permission.TRACE_READ])],
    [Role.AUDITOR, new Set([Permission.TRACE_READ, Permission.TRACE_SHARE])],
  ]);

  hasPermission(role: Role, permission: Permission): boolean {
    const permissions = this.rolePermissions.get(role);
    return permissions?.has(permission) ?? false;
  }

  async canAccessTrace(user: User, trace: Trace, action: Permission): Promise<boolean> {
    if (!this.hasPermission(user.role, action)) {
      return false;
    }

    // Check ownership or team access
    if (trace.metadata.ownerId !== user.id) {
      const hasTeamAccess = await this.checkTeamAccess(user.id, trace.metadata.id);
      if (!hasTeamAccess) {
        return false;
      }
    }

    return true;
  }
}
```

#### Resource-Based Access Control

```typescript
// ✅ Good: Fine-grained access control
interface AccessPolicy {
  id: string;
  resourceType: 'trace' | 'checkpoint' | 'storage';
  resourceId: string;
  principal: string; // User or role ID
  actions: string[];
  conditions?: AccessCondition[];
  effect: 'allow' | 'deny';
}

class PolicyEvaluator {
  async evaluate(
    principal: string,
    action: string,
    resource: string,
    context: EvaluationContext
  ): Promise<boolean> {
    const policies = await this.loadPolicies(principal, resource);

    let decision = false;
    for (const policy of policies) {
      if (this.matchesPolicy(policy, action, resource, context)) {
        if (policy.effect === 'deny') {
          return false; // Explicit deny takes precedence
        }
        decision = true;
      }
    }

    return decision;
  }
}
```

### 4. Audit Logging

#### Security Event Logging

```typescript
// ✅ Good: Comprehensive audit logging
interface SecurityEvent {
  timestamp: number;
  eventType: SecurityEventType;
  actor: {
    userId: string;
    role: string;
    ipAddress: string;
    userAgent: string;
  };
  action: string;
  resource: {
    type: string;
    id: string;
  };
  outcome: 'success' | 'failure';
  reason?: string;
  metadata?: Record<string, any>;
}

class AuditLogger {
  private readonly logStream: Writable;

  async log(event: SecurityEvent): Promise<void> {
    const entry = {
      ...event,
      timestamp: new Date(event.timestamp).toISOString(),
      version: '1.0',
    };

    // Write to secure audit log
    await this.writeToAuditLog(entry);

    // Alert on suspicious activity
    if (this.isSuspicious(event)) {
      await this.sendAlert(event);
    }
  }

  private isSuspicious(event: SecurityEvent): boolean {
    // Detect suspicious patterns
    const suspiciousPatterns = [
      event.outcome === 'failure' && event.action === 'trace:read',
      event.actor.ipAddress in this.blockedIPs,
      event.action === 'trace:delete' && event.actor.role === 'viewer',
    ];

    return suspiciousPatterns.some(pattern => pattern);
  }
}
```

### 5. Secret Management

#### Secure Configuration

```typescript
// ✅ Good: Secure secret handling
class SecretManager {
  private readonly secretsClient: SecretsClient;

  async getSecret(name: string): Promise<string> {
    // Retrieve from secure secret store (AWS Secrets Manager, HashiCorp Vault, etc.)
    const secret = await this.secretsClient.getSecretValue(name);

    // Clear from memory after use
    setImmediate(() => {
      secret.destroy();
    });

    return secret.toString();
  }

  async rotateKey(keyId: string): Promise<void> {
    // Generate new key
    const newKey = await this.generateKey();

    // Re-encrypt data with new key
    await this.reEncryptWithNewKey(keyId, newKey);

    // Securely delete old key
    await this.secureDeleteKey(keyId);
  }
}
```

## Security Testing

### Static Analysis

```typescript
// ✅ Good: Automated security scanning
class SecurityScanner {
  async scan(codebase: string): Promise<SecurityReport> {
    const findings: SecurityFinding[] = [];

    // Run SAST tools
    findings.push(...(await this.runSAST(codebase)));

    // Check dependencies
    findings.push(...(await this.checkDependencies(codebase)));

    // Scan for secrets
    findings.push(...(await this.scanForSecrets(codebase)));

    return {
      findings,
      severity: this.calculateSeverity(findings),
      recommendations: this.generateRecommendations(findings),
    };
  }
}
```

### Dynamic Testing

```typescript
// ✅ Good: Security penetration testing
class SecurityTester {
  async testAPI(apiEndpoint: string): Promise<SecurityReport> {
    const findings: SecurityFinding[] = [];

    // Test authentication
    findings.push(...(await this.testAuthentication(apiEndpoint)));

    // Test authorization
    findings.push(...(await this.testAuthorization(apiEndpoint)));

    // Test input validation
    findings.push(...(await this.testInputValidation(apiEndpoint)));

    // Test rate limiting
    findings.push(...(await this.testRateLimiting(apiEndpoint)));

    return { findings };
  }
}
```

## Security Checklist

### Pre-Deployment

- [ ] All dependencies scanned for vulnerabilities
- [ ] Secrets removed from code and config files
- [ ] TLS enabled for all network communication
- [ ] Access controls implemented and tested
- [ ] Audit logging configured
- [ ] Security headers set
- [ ] Rate limiting enabled
- [ ] Input validation implemented
- [ ] Error messages sanitized
- [ ] Security tests passing

### Post-Deployment

- [ ] Monitor security logs
- [ ] Regular vulnerability scans
- [ ] Penetration testing scheduled
- [ ] Incident response plan ready
- [ ] Security patches applied
- [ ] Access reviews conducted
- [ ] Backup and recovery tested

## Compliance

### Data Protection Regulations

```typescript
// ✅ Good: GDPR compliance helpers
class GDPRCompliance {
  async handleDataSubjectRequest(
    userId: string,
    requestType: 'access' | 'deletion' | 'portability'
  ): Promise<void> {
    switch (requestType) {
      case 'access':
        await this.provideDataAccess(userId);
        break;
      case 'deletion':
        await this.deleteUserData(userId);
        break;
      case 'portability':
        await this.exportUserData(userId);
        break;
    }
  }

  private async deleteUserData(userId: string): Promise<void> {
    // Anonymize or delete user data
    await this.anonymizeTraces(userId);
    await this.deleteAuditLogs(userId);
    await this.notifyDataProcessors(userId);
  }
}
```

## Resources

### Documentation

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/)

### Tools

- Snyk - Dependency scanning
- ESLint security plugin
- npm audit
- OWASP ZAP
- Burp Suite

---

**Maintained by**: @reaatech and contributors  
**Last Updated**: 2026-04-22
