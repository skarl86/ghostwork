/**
 * @paperclip/db — Database schema and ORM (placeholder)
 *
 * Phase 1에서 Drizzle ORM + PostgreSQL 스키마로 교체 예정
 */

export interface DbConfig {
  connectionString?: string;
  embedded?: boolean;
}

export function createDbPlaceholder(config: DbConfig): { config: DbConfig } {
  return { config };
}
