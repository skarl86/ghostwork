/**
 * claude-local adapter — runs Claude Code CLI as a subprocess.
 *
 * Command: claude --print - --output-format stream-json --verbose
 */

import { mkdtemp, rm, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runChildProcess } from '../child-process.js';
import type {
  ServerAdapterModule,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestResult,
} from '../types.js';
import {
  parseClaudeStreamJson,
  extractSessionId,
  extractCostUsd,
  extractUsage,
  isClaudeUnknownSessionError,
  detectClaudeLoginRequired,
  type ClaudeEvent,
} from './claude-jsonl.js';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function buildArgs(
  ctx: AdapterExecutionContext,
  sessionId: string | null,
  skillsDir: string | null,
): string[] {
  const args = ['--print', '-', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions'];

  if (sessionId) {
    args.push('--resume', sessionId);
  }

  if (skillsDir) {
    args.push('--add-dir', skillsDir);
  }

  // Inject role-based skill directories via --add-dir
  const skillDirs = ctx.config['skillDirs'] as string[] | undefined;
  if (skillDirs) {
    for (const dir of skillDirs) {
      args.push('--add-dir', dir);
    }
  }

  // Allow overriding model via config
  const model = ctx.config['model'] as string | undefined;
  if (model) {
    args.push('--model', model);
  }

  return args;
}

/**
 * Create ephemeral skills directory with symlinks.
 */
async function prepareSkillsDir(
  skillPaths: string[],
): Promise<string | null> {
  if (skillPaths.length === 0) return null;

  const tmpDir = await mkdtemp(join(tmpdir(), 'ghostwork-skills-'));
  const skillsBase = join(tmpDir, '.claude', 'skills');
  await mkdir(skillsBase, { recursive: true });

  for (const skillPath of skillPaths) {
    const name = skillPath.split('/').pop() ?? 'skill';
    const linkPath = join(skillsBase, name);
    await symlink(skillPath, linkPath);
  }

  return tmpDir;
}

async function cleanupSkillsDir(dir: string | null): Promise<void> {
  if (dir) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function executeOnce(
  ctx: AdapterExecutionContext,
  sessionId: string | null,
): Promise<AdapterExecutionResult> {
  const skillPaths = (ctx.config['skillPaths'] as string[]) ?? [];
  let skillsDir: string | null = null;

  try {
    skillsDir = await prepareSkillsDir(skillPaths);

    const args = buildArgs(ctx, sessionId, skillsDir);
    const prompt = (ctx.context['prompt'] as string) ?? '';
    const cwd = (ctx.config['cwd'] as string) ?? undefined;
    const timeoutMs =
      (ctx.config['timeoutMs'] as number) ?? DEFAULT_TIMEOUT_MS;

    const events: ClaudeEvent[] = [];
    let stderrOutput = '';

    const { handle, result } = runChildProcess({
      command: 'claude',
      args,
      cwd,
      stdin: prompt,
      timeoutMs,
      onLog(stream, chunk) {
        ctx.onLog(stream, chunk);

        if (stream === 'stdout') {
          const event = parseClaudeStreamJson(chunk);
          if (event) events.push(event);
        } else {
          stderrOutput += chunk + '\n';
        }
      },
    });

    ctx.onSpawn?.({ pid: handle.pid, command: `claude ${args.join(' ')}` });

    const processResult = await result;

    // Extract data from events
    let resultSessionId: string | null = null;
    let costUsd: string | null = null;
    let usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
    let model: string | null = null;
    let summary: string | null = null;

    for (const event of events) {
      const sid = extractSessionId(event);
      if (sid) resultSessionId = sid;

      const cost = extractCostUsd(event);
      if (cost) costUsd = cost;

      if (event.type === 'result') {
        usage = extractUsage(event);
        model = (event['model'] as string) ?? model;
      }

      if (event.type === 'assistant' && event.message?.content) {
        const textParts = event.message.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text)
          .join('');
        if (textParts) summary = textParts;
      }
    }

    // Detect auth errors
    if (detectClaudeLoginRequired(stderrOutput)) {
      return {
        exitCode: processResult.exitCode,
        signal: processResult.signal,
        timedOut: processResult.timedOut,
        usage,
        sessionId: null,
        sessionParams: null,
        provider: 'anthropic',
        biller: null,
        model,
        billingType: null,
        costUsd: null,
        summary: 'Authentication required — please log in to Claude CLI',
        clearSession: true,
      };
    }

    // Determine billing type
    const billingType: 'api' | 'subscription' | null =
      process.env['ANTHROPIC_API_KEY'] ? 'api' : 'subscription';

    return {
      exitCode: processResult.exitCode,
      signal: processResult.signal,
      timedOut: processResult.timedOut,
      usage,
      sessionId: resultSessionId,
      sessionParams: null,
      provider: 'anthropic',
      biller: null,
      model,
      billingType,
      costUsd,
      summary,
      clearSession: processResult.timedOut,
    };
  } finally {
    await cleanupSkillsDir(skillsDir);
  }
}

export const claudeLocalAdapter: ServerAdapterModule = {
  type: 'claude-local',

  models: [
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
    { id: 'claude-haiku-3-5', name: 'Claude Haiku 3.5', provider: 'anthropic' },
  ],

  async execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
    const sessionId = ctx.runtime.sessionId;

    // First attempt (possibly with session)
    const result = await executeOnce(ctx, sessionId);

    // Session error detection: retry without session
    if (
      sessionId &&
      result.exitCode !== 0 &&
      result.summary &&
      isClaudeUnknownSessionError(result.summary)
    ) {
      return executeOnce(ctx, null);
    }

    return result;
  },

  async testEnvironment(
    _ctx: AdapterExecutionContext,
  ): Promise<AdapterEnvironmentTestResult> {
    try {
      const { result } = runChildProcess({
        command: 'claude',
        args: ['--version'],
        timeoutMs: 10_000,
      });

      const res = await result;

      if (res.exitCode === 0) {
        return { ok: true };
      }

      return {
        ok: false,
        error: `claude CLI exited with code ${res.exitCode}`,
      };
    } catch {
      return {
        ok: false,
        error: 'claude CLI not found — please install Claude Code CLI',
      };
    }
  },
};
