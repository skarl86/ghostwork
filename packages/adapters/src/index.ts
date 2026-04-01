/**
 * @ghostwork/adapters — Agent adapter system.
 *
 * Provides a unified interface for running AI agent CLIs (Claude, Codex, etc.)
 * and generic subprocesses.
 */

// ── Types ──
export type {
  ServerAdapterModule,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestResult,
  ProcessHandle,
  SpawnInfo,
  AdapterSkillSnapshot,
  AdapterSessionCodec,
  AdapterModel,
  SkillInfo,
  SkillStatus,
  RunChildProcessOptions,
  RunChildProcessResult,
  ChildProcessHandle,
} from './types.js';

// ── Registry ──
export { createAdapterRegistry, type AdapterRegistry } from './registry.js';

// ── Child Process ──
export { runChildProcess } from './child-process.js';

// ── Adapters ──
export { claudeLocalAdapter } from './adapters/claude-local.js';
export { codexLocalAdapter } from './adapters/codex-local.js';
export { geminiLocalAdapter } from './adapters/gemini-local.js';
export { openclawGatewayAdapter } from './adapters/openclaw-gateway.js';
export { httpAdapter } from './adapters/http.js';
export { processAdapter } from './adapters/process.js';

// ── Claude JSONL parser ──
export {
  parseClaudeStreamJson,
  extractSessionId,
  extractCostUsd,
  extractUsage,
  isClaudeUnknownSessionError,
  detectClaudeLoginRequired,
  type ClaudeEvent,
  type ClaudeEventType,
  type ClaudeSystemEvent,
  type ClaudeInitEvent,
  type ClaudeAssistantEvent,
  type ClaudeResultEvent,
} from './adapters/claude-jsonl.js';

// ── Codex JSONL parser ──
export {
  parseCodexJsonl,
  extractCodexThreadId,
  extractCodexCostUsd,
  extractCodexUsage,
  isCodexTurnFailed,
  type CodexEvent,
  type CodexEventType,
  type CodexThreadStartedEvent,
  type CodexItemCompletedEvent,
  type CodexTurnCompletedEvent,
  type CodexTurnFailedEvent,
} from './adapters/codex-jsonl.js';

// ── Gemini JSONL parser ──
export {
  parseGeminiJsonl,
  extractGeminiUsage,
  extractGeminiCostUsd,
  extractGeminiModel,
  detectGeminiAuthRequired,
  type GeminiEvent,
  type GeminiEventType,
  type GeminiSystemEvent,
  type GeminiAssistantEvent,
  type GeminiTextEvent,
  type GeminiResultEvent,
  type GeminiErrorEvent,
} from './adapters/gemini-jsonl.js';

// ── Testing utilities ──
export {
  createMockAdapter,
  createFailingAdapter,
  createTimeoutAdapter,
  createThrowingAdapter,
  createTestContext,
} from './testing.js';
