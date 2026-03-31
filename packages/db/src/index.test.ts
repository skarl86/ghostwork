import { describe, it, expect } from 'vitest';
import { createDbPlaceholder } from './index.js';

describe('DB placeholder', () => {
  it('createDbPlaceholder — returns config', () => {
    const db = createDbPlaceholder({ embedded: true });
    expect(db.config.embedded).toBe(true);
    expect(db.config.connectionString).toBeUndefined();
  });

  it('createDbPlaceholder — accepts connectionString', () => {
    const db = createDbPlaceholder({ connectionString: 'postgresql://localhost/test' });
    expect(db.config.connectionString).toBe('postgresql://localhost/test');
  });
});
