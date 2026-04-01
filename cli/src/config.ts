/**
 * CLI configuration — reads from environment variables.
 */

export interface CliConfig {
  apiUrl: string;
  mode: string;
}

export function loadCliConfig(): CliConfig {
  return {
    apiUrl: process.env['GHOSTWORK_API_URL'] ?? 'http://localhost:3100',
    mode: process.env['GHOSTWORK_MODE'] ?? 'local_trusted',
  };
}
