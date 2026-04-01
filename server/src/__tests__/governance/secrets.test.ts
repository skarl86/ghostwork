import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptValue, decryptValue } from '../../services/secrets.js';

describe('Secret encryption/decryption', () => {
  const key = randomBytes(32).toString('hex');

  it('encrypts and decrypts back to original value', () => {
    const plaintext = 'sk-secret-api-key-12345';
    const encrypted = encryptValue(plaintext, key);
    const decrypted = decryptValue(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypted format is iv:authTag:ciphertext', () => {
    const encrypted = encryptValue('test', key);
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    // IV is 12 bytes = 24 hex chars
    expect(parts[0]).toHaveLength(24);
    // Auth tag is 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // Ciphertext length varies
    expect(parts[2]!.length).toBeGreaterThan(0);
  });

  it('different encryptions of same value produce different ciphertexts (random IV)', () => {
    const encrypted1 = encryptValue('same-value', key);
    const encrypted2 = encryptValue('same-value', key);
    expect(encrypted1).not.toBe(encrypted2);

    // But both decrypt to the same value
    expect(decryptValue(encrypted1, key)).toBe('same-value');
    expect(decryptValue(encrypted2, key)).toBe('same-value');
  });

  it('fails to decrypt with wrong key', () => {
    const encrypted = encryptValue('secret', key);
    const wrongKey = randomBytes(32).toString('hex');
    expect(() => decryptValue(encrypted, wrongKey)).toThrow();
  });

  it('fails with invalid key length', () => {
    expect(() => encryptValue('test', 'short-key')).toThrow('32 bytes');
    expect(() => decryptValue('aa:bb:cc', 'short-key')).toThrow('32 bytes');
  });

  it('handles empty string', () => {
    const encrypted = encryptValue('', key);
    const decrypted = decryptValue(encrypted, key);
    expect(decrypted).toBe('');
  });

  it('handles unicode', () => {
    const plaintext = '시크릿 키 🔑 μυστικό';
    const encrypted = encryptValue(plaintext, key);
    const decrypted = decryptValue(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });
});
