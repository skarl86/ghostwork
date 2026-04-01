/**
 * Secret management service — encrypted storage for company secrets.
 *
 * Uses AES-256-GCM with a server-side key for encryption/decryption.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import { companySecrets, companySecretVersions } from '@ghostwork/db';
import type { Db } from '@ghostwork/db';
import { NotFoundError, ConflictError } from '../errors.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a plaintext value. Returns `iv:authTag:ciphertext` all hex-encoded.
 */
export function encryptValue(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (64 hex chars)');
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an encrypted value. Expects `iv:authTag:ciphertext` hex format.
 */
export function decryptValue(encrypted: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (64 hex chars)');
  }
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export interface CreateSecretInput {
  companyId: string;
  name: string;
  value: string; // plaintext — will be encrypted before storage
}

export function secretService(db: Db, encryptionKey: string) {
  return {
    async list(companyId: string, limit = 50, offset = 0) {
      return db
        .select()
        .from(companySecrets)
        .where(eq(companySecrets.companyId, companyId))
        .limit(limit)
        .offset(offset);
    },

    async getById(id: string) {
      const rows = await db.select().from(companySecrets).where(eq(companySecrets.id, id));
      const row = rows[0];
      if (!row) throw new NotFoundError(`Secret ${id} not found`);
      return row;
    },

    async create(input: CreateSecretInput) {
      const now = new Date();

      // Create secret record
      const secretRows = await db
        .insert(companySecrets)
        .values({
          companyId: input.companyId,
          name: input.name,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      const secret = secretRows[0];
      if (!secret) throw new ConflictError('Failed to create secret');

      // Create initial version with encrypted value
      const encryptedValue = encryptValue(input.value, encryptionKey);
      await db.insert(companySecretVersions).values({
        secretId: secret.id,
        encryptedValue,
        version: 1,
        createdAt: now,
      });

      return secret;
    },

    async updateValue(secretId: string, plaintext: string) {
      // Verify secret exists
      await this.getById(secretId);

      // Get latest version number
      const versions = await db
        .select()
        .from(companySecretVersions)
        .where(eq(companySecretVersions.secretId, secretId))
        .orderBy(desc(companySecretVersions.version))
        .limit(1);

      const nextVersion = (versions[0]?.version ?? 0) + 1;
      const encryptedValue = encryptValue(plaintext, encryptionKey);

      const rows = await db
        .insert(companySecretVersions)
        .values({
          secretId,
          encryptedValue,
          version: nextVersion,
          createdAt: new Date(),
        })
        .returning();

      // Update secret's updatedAt
      await db
        .update(companySecrets)
        .set({ updatedAt: new Date() })
        .where(eq(companySecrets.id, secretId));

      return rows[0];
    },

    async remove(id: string) {
      // Delete versions first
      await db
        .delete(companySecretVersions)
        .where(eq(companySecretVersions.secretId, id));

      const rows = await db
        .delete(companySecrets)
        .where(eq(companySecrets.id, id))
        .returning();
      const row = rows[0];
      if (!row) throw new NotFoundError(`Secret ${id} not found`);
      return row;
    },

    /**
     * Get decrypted secrets for an agent's company.
     * Returns a map of secret name → decrypted value.
     */
    async getSecretsForAgent(
      companyId: string,
      _agentId: string,
    ): Promise<Record<string, string>> {
      const secrets = await db
        .select()
        .from(companySecrets)
        .where(eq(companySecrets.companyId, companyId));

      const result: Record<string, string> = {};

      for (const secret of secrets) {
        // Get latest version
        const versions = await db
          .select()
          .from(companySecretVersions)
          .where(eq(companySecretVersions.secretId, secret.id))
          .orderBy(desc(companySecretVersions.version))
          .limit(1);

        const latest = versions[0];
        if (latest) {
          result[secret.name] = decryptValue(latest.encryptedValue, encryptionKey);
        }
      }

      return result;
    },
  };
}
