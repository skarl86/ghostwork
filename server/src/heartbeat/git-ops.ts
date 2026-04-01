/**
 * Git Operations — system-managed git automation for the heartbeat pipeline.
 *
 * Provides auto-commit, branch creation, and push+PR creation.
 * All functions are non-blocking on failure: they return error info
 * instead of throwing, so the caller can log and continue.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Default timeout for git operations (30 seconds) */
const GIT_TIMEOUT_MS = 30_000;

/** Default timeout for gh CLI operations (60 seconds) */
const GH_TIMEOUT_MS = 60_000;

interface ExecResult {
  stdout: string;
  stderr: string;
}

async function run(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs = GIT_TIMEOUT_MS,
): Promise<ExecResult> {
  return execFileAsync(cmd, args, {
    cwd,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024, // 10MB
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

// ── Branch Creation ──

export async function createBranch(
  cwd: string,
  branchName: string,
): Promise<{ created: boolean; error?: string }> {
  try {
    // Check if branch already exists locally
    try {
      await run('git', ['rev-parse', '--verify', branchName], cwd);
      // Branch exists — just checkout
      await run('git', ['checkout', branchName], cwd);
      return { created: false };
    } catch {
      // Branch doesn't exist — create it
    }

    await run('git', ['checkout', '-b', branchName], cwd);
    return { created: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { created: false, error: `createBranch failed: ${message}` };
  }
}

// ── Auto Commit ──

export async function autoCommit(
  cwd: string,
  message: string,
): Promise<{ committed: boolean; sha?: string; error?: string }> {
  try {
    // Stage all changes
    await run('git', ['add', '-A'], cwd);

    // Check if there are staged changes
    try {
      await run('git', ['diff', '--cached', '--quiet'], cwd);
      // Exit code 0 = no changes
      return { committed: false };
    } catch {
      // Exit code 1 = there ARE changes — proceed with commit
    }

    const { stdout } = await run(
      'git',
      ['commit', '-m', message, '--no-verify'],
      cwd,
    );

    // Extract commit SHA
    const shaMatch = stdout.match(/\[[\w/.-]+\s+([a-f0-9]+)\]/);
    const sha = shaMatch?.[1];

    return { committed: true, sha };
  } catch (err) {
    const message_ = err instanceof Error ? err.message : String(err);
    return { committed: false, error: `autoCommit failed: ${message_}` };
  }
}

// ── Push & Create PR ──

export async function pushAndCreatePR(
  cwd: string,
  branchName: string,
  title: string,
  body: string,
): Promise<{ prUrl?: string; error?: string }> {
  try {
    // Push branch to origin
    await run('git', ['push', '-u', 'origin', branchName], cwd, GH_TIMEOUT_MS);

    // Create PR via gh CLI
    const { stdout } = await run(
      'gh',
      [
        'pr', 'create',
        '--base', 'main',
        '--head', branchName,
        '--title', title,
        '--body', body,
      ],
      cwd,
      GH_TIMEOUT_MS,
    );

    const prUrl = stdout.trim();
    return { prUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // If PR already exists, try to find its URL
    if (message.includes('already exists')) {
      try {
        const { stdout } = await run(
          'gh',
          ['pr', 'view', branchName, '--json', 'url', '-q', '.url'],
          cwd,
          GH_TIMEOUT_MS,
        );
        return { prUrl: stdout.trim() };
      } catch {
        // Ignore — return original error
      }
    }

    return { error: `pushAndCreatePR failed: ${message}` };
  }
}

// ── Slug Helper ──

/**
 * Generate a branch-safe slug from an issue title.
 * Extracts alphanumeric chars + Korean chars, converts to kebab-case, max 40 chars.
 */
export function slugify(title: string, maxLen = 40): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\uAC00-\uD7A3\s-]/g, '') // keep alphanumeric, Korean, spaces, hyphens
    .trim()
    .replace(/\s+/g, '-') // spaces to hyphens
    .replace(/-+/g, '-') // collapse multiple hyphens
    .slice(0, maxLen)
    .replace(/-$/, ''); // remove trailing hyphen
}
