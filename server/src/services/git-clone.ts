/**
 * Git clone service — clones or pulls a repository into a local directory.
 */

import { execFile as execFileCb } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

const CLONE_TIMEOUT_MS = 120_000;

// ── URL parsing ──

/**
 * Extracts the repository name from an HTTPS or SSH git URL.
 *
 * Examples:
 *   https://github.com/org/repo.git  → repo
 *   git@github.com:org/repo.git      → repo
 *   https://github.com/org/repo      → repo
 */
export function extractRepoName(repoUrl: string): string {
  // Strip trailing slashes
  const trimmed = repoUrl.replace(/\/+$/, '');

  // Get the last path/colon-separated segment
  const segment = trimmed.split(/[/:]/).pop() ?? '';

  // Strip .git suffix
  return segment.replace(/\.git$/, '');
}

/**
 * Resolves the default clone directory: ~/.ghostwork/{repo-name}.
 */
export function defaultCloneDir(repoUrl: string): string {
  const repoName = extractRepoName(repoUrl);
  return path.join(os.homedir(), '.ghostwork', repoName);
}

// ── Git helpers ──

async function gitGetRemoteUrl(cwd: string): Promise<string> {
  const { stdout } = await execFile('git', ['remote', 'get-url', 'origin'], { cwd });
  return stdout.trim();
}

async function gitDefaultBranch(cwd: string): Promise<string> {
  // Try symbolic-ref first (works on cloned repos)
  try {
    const { stdout } = await execFile(
      'git',
      ['symbolic-ref', '--short', 'HEAD'],
      { cwd },
    );
    const branch = stdout.trim();
    if (branch) return branch;
  } catch {
    // fall through
  }

  // Fall back to parsing remote HEAD
  try {
    const { stdout } = await execFile(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd },
    );
    const branch = stdout.trim();
    if (branch && branch !== 'HEAD') return branch;
  } catch {
    // fall through
  }

  return 'main';
}

// ── Public API ──

export interface CloneResult {
  cwd: string;
  branch: string;
  /** true = fresh clone, false = existing repo was pulled */
  cloned: boolean;
}

/**
 * Clones a git repository or pulls if it already exists at the target directory.
 *
 * @param repoUrl   - HTTPS or SSH git URL
 * @param targetDir - Local path to clone into (defaults to ~/.ghostwork/{repo-name})
 * @param branch    - Branch to clone/checkout (defaults to remote HEAD)
 */
export async function cloneRepository(
  repoUrl: string,
  targetDir?: string,
  branch?: string,
): Promise<CloneResult> {
  const cwd = targetDir ?? defaultCloneDir(repoUrl);

  // Check whether the directory already exists
  let dirExists = false;
  try {
    const s = await stat(cwd);
    if (!s.isDirectory()) {
      throw new Error(`Target path exists but is not a directory: ${cwd}`);
    }
    dirExists = true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw err;
  }

  if (dirExists) {
    // Verify the existing repo points to the same remote
    let existingRemote: string;
    try {
      existingRemote = await gitGetRemoteUrl(cwd);
    } catch {
      throw new Error(
        `Directory ${cwd} exists but does not appear to be a git repository`,
      );
    }

    // Normalize URLs for comparison (strip .git suffix and trailing slashes)
    const normalize = (u: string) => u.replace(/\.git$/, '').replace(/\/+$/, '');
    if (normalize(existingRemote) !== normalize(repoUrl)) {
      throw new Error(
        `Directory ${cwd} already contains a different repository (${existingRemote})`,
      );
    }

    // Checkout the requested branch if specified, then pull
    if (branch) {
      try {
        await execFile('git', ['checkout', branch], { cwd, timeout: CLONE_TIMEOUT_MS });
      } catch (err: unknown) {
        throw new Error(`git checkout failed: ${(err as Error).message}`, { cause: err });
      }
    }

    try {
      await execFile('git', ['pull', '--ff-only'], {
        cwd,
        timeout: CLONE_TIMEOUT_MS,
      });
    } catch (err: unknown) {
      throw new Error(`git pull failed: ${(err as Error).message}`, { cause: err });
    }
  } else {
    // Create parent directory and clone
    await mkdir(path.dirname(cwd), { recursive: true });

    const cloneArgs = branch
      ? ['clone', '--branch', branch, repoUrl, cwd]
      : ['clone', repoUrl, cwd];

    try {
      await execFile('git', cloneArgs, {
        timeout: CLONE_TIMEOUT_MS,
      });
    } catch (err: unknown) {
      const msg = (err as Error).message ?? String(err);
      if (msg.includes('Permission denied') || msg.includes('EACCES')) {
        throw new Error(`git clone failed: permission denied accessing ${cwd}`, { cause: err });
      }
      if (msg.includes('ETIMEDOUT') || msg.includes('timed out')) {
        throw new Error(`git clone failed: connection timed out`, { cause: err });
      }
      throw new Error(`git clone failed: ${msg}`, { cause: err });
    }
  }

  const resolvedBranch = await gitDefaultBranch(cwd);
  return { cwd, branch: resolvedBranch, cloned: !dirExists };
}
