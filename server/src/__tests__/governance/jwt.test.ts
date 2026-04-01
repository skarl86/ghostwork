import { describe, it, expect } from 'vitest';
import { generateAgentToken, verifyAgentToken } from '../../auth/jwt.js';

const TEST_SECRET = 'test-secret-key-for-jwt-testing-123';

describe('Agent JWT', () => {
  it('generates a valid JWT that can be verified', () => {
    const token = generateAgentToken(
      { agentId: 'agent-1', companyId: 'company-1', adapterType: 'claude-local' },
      TEST_SECRET,
    );

    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(3);

    const payload = verifyAgentToken(token, TEST_SECRET);
    expect(payload.sub).toBe('agent-1');
    expect(payload.company_id).toBe('company-1');
    expect(payload.adapter_type).toBe('claude-local');
    expect(payload.iss).toBe('ghostwork');
    expect(payload.aud).toBe('ghostwork-api');
  });

  it('rejects token with wrong secret', () => {
    const token = generateAgentToken(
      { agentId: 'agent-1', companyId: 'company-1' },
      TEST_SECRET,
    );

    expect(() => verifyAgentToken(token, 'wrong-secret')).toThrow('Invalid JWT signature');
  });

  it('rejects expired token', () => {
    // Generate a token that expired 1 hour ago
    const token = generateAgentToken(
      { agentId: 'agent-1', companyId: 'company-1', expiryHours: -1 },
      TEST_SECRET,
    );

    expect(() => verifyAgentToken(token, TEST_SECRET)).toThrow('JWT token has expired');
  });

  it('rejects malformed token', () => {
    expect(() => verifyAgentToken('not.a.valid-jwt', TEST_SECRET)).toThrow();
    expect(() => verifyAgentToken('invalid', TEST_SECRET)).toThrow('Invalid JWT format');
  });

  it('includes optional fields when provided', () => {
    const token = generateAgentToken(
      { agentId: 'a-1', companyId: 'c-1', runId: 'run-42', adapterType: 'process' },
      TEST_SECRET,
    );

    const payload = verifyAgentToken(token, TEST_SECRET);
    expect(payload.run_id).toBe('run-42');
    expect(payload.adapter_type).toBe('process');
  });

  it('omits optional fields when not provided', () => {
    const token = generateAgentToken(
      { agentId: 'a-1', companyId: 'c-1' },
      TEST_SECRET,
    );

    const payload = verifyAgentToken(token, TEST_SECRET);
    expect(payload.run_id).toBeUndefined();
    expect(payload.adapter_type).toBeUndefined();
  });

  it('throws when secret is empty', () => {
    expect(() =>
      generateAgentToken({ agentId: 'a-1', companyId: 'c-1' }, ''),
    ).toThrow('GHOSTWORK_AGENT_JWT_SECRET is required');
  });
});
