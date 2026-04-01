/**
 * Agent JWT — HMAC-SHA256 token generation and verification.
 *
 * No external JWT library — implemented with Node.js crypto.
 * Format: base64url(header).base64url(payload).base64url(signature)
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'HS256';
const ISSUER = 'ghostwork';
const AUDIENCE = 'ghostwork-api';
const DEFAULT_EXPIRY_HOURS = 48;

export interface AgentJwtPayload {
  sub: string; // agentId
  company_id: string;
  adapter_type?: string;
  run_id?: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface GenerateTokenInput {
  agentId: string;
  companyId: string;
  adapterType?: string;
  runId?: string;
  expiryHours?: number;
}

function base64urlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return buf.toString('base64url');
}

function base64urlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function sign(data: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(data);
  return hmac.digest('base64url');
}

/**
 * Generate an agent JWT token.
 */
export function generateAgentToken(input: GenerateTokenInput, secret: string): string {
  if (!secret) {
    throw new Error('GHOSTWORK_AGENT_JWT_SECRET is required for JWT generation');
  }

  const now = Math.floor(Date.now() / 1000);
  const expiryHours = input.expiryHours ?? DEFAULT_EXPIRY_HOURS;

  const header = { alg: ALGORITHM, typ: 'JWT' };
  const payload: AgentJwtPayload = {
    sub: input.agentId,
    company_id: input.companyId,
    ...(input.adapterType && { adapter_type: input.adapterType }),
    ...(input.runId && { run_id: input.runId }),
    iat: now,
    exp: now + expiryHours * 3600,
    iss: ISSUER,
    aud: AUDIENCE,
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signature = sign(`${headerB64}.${payloadB64}`, secret);

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verify an agent JWT and return the decoded payload.
 * Throws on invalid signature or expired token.
 */
export function verifyAgentToken(
  token: string,
  secret: string,
): AgentJwtPayload {
  if (!secret) {
    throw new Error('GHOSTWORK_AGENT_JWT_SECRET is required for JWT verification');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  // Verify signature (timing-safe comparison to prevent timing attacks)
  const expectedSignature = sign(`${headerB64}.${payloadB64}`, secret);
  const sigBuf = Buffer.from(signatureB64, 'utf8');
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error('Invalid JWT signature');
  }

  // Decode and validate header
  const header = JSON.parse(base64urlDecode(headerB64)) as { alg: string; typ: string };
  if (header.alg !== ALGORITHM) {
    throw new Error(`Unsupported JWT algorithm: ${header.alg}`);
  }

  // Decode payload
  const payload = JSON.parse(base64urlDecode(payloadB64)) as AgentJwtPayload;

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new Error('JWT token has expired');
  }

  // Validate issuer/audience
  if (payload.iss !== ISSUER) {
    throw new Error(`Invalid JWT issuer: ${payload.iss}`);
  }
  if (payload.aud !== AUDIENCE) {
    throw new Error(`Invalid JWT audience: ${payload.aud}`);
  }

  return payload;
}
