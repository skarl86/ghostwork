/**
 * @ghostwork/cli — CLI tool for Ghostwork agent orchestration.
 *
 * Usage:
 *   ghostwork company create --name "My Company"
 *   ghostwork company list
 *   ghostwork agent create --company <id> --name "Bot" --adapter process
 *   ghostwork agent list --company <id>
 *   ghostwork issue create --company <id> --title "Fix bug"
 *   ghostwork issue list --company <id>
 *   ghostwork wakeup --company <id> --agent <id>
 *   ghostwork runs list --company <id>
 *   ghostwork logs watch --company <id>
 */

export const CLI_VERSION = '0.1.0';

export { createProgram } from './program.js';
export { createApiClient, type ApiClient, ApiClientError } from './api-client.js';
export { loadCliConfig, type CliConfig } from './config.js';
