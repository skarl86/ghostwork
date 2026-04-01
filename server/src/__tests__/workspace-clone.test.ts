/**
 * Workspace clone workflow tests.
 *
 * Section 1 — cloneRepository service (unit, real local git in tmpdir, no network)
 * Section 2 — POST /projects/:id/workspace/clone API route (unit, mocked DB + service)
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import type { Db } from '@ghostwork/db';
import { buildTestApp } from './helpers.js';
import type * as GitCloneModule from '../services/git-clone.js';

// ── Module mocks ─────────────────────────────────────────────────────────────

// Partially mock git-clone: keep real pure helpers, but allow controlling
// cloneRepository in API tests without hitting the filesystem/network.
vi.mock('../services/git-clone.js', async () => {
  const actual = await vi.importActual<typeof GitCloneModule>(
    '../services/git-clone.js',
  );
  return { ...actual, cloneRepository: vi.fn() };
});

// Mock projectService so API tests never need a real DB for project lookups.
vi.mock('../services/projects.js');

import { cloneRepository } from '../services/git-clone.js';
import { projectService } from '../services/projects.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function initLocalRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@ghost.local"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Ghost Test"', { cwd: dir, stdio: 'pipe' });
  fs.writeFileSync(path.join(dir, 'README.md'), '# test');
  execSync('git add .', { cwd: dir, stdio: 'pipe' });
  execSync('git commit -m "init" --no-gpg-sign', { cwd: dir, stdio: 'pipe' });
}

function rmrf(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Section 1: cloneRepository service — real local git, no network
// ══════════════════════════════════════════════════════════════════════════════

describe('cloneRepository service', () => {
  // Get the real (un-mocked) cloneRepository at runtime.
  let realClone: typeof cloneRepository;
  let sourceDir: string;
  const cloneDirs: string[] = [];

  beforeAll(async () => {
    const actual = await vi.importActual<typeof GitCloneModule>(
      '../services/git-clone.js',
    );
    realClone = actual.cloneRepository;

    sourceDir = path.join(os.tmpdir(), `gw-src-${Date.now()}`);
    initLocalRepo(sourceDir);
  });

  afterEach(() => {
    for (const d of cloneDirs.splice(0)) rmrf(d);
  });

  afterAll(() => rmrf(sourceDir));

  it('clones into a custom targetDir and returns cwd + branch', async () => {
    const targetDir = path.join(os.tmpdir(), `gw-clone-${Date.now()}`);
    cloneDirs.push(targetDir);

    const result = await realClone(sourceDir, targetDir);

    expect(result.cwd).toBe(targetDir);
    expect(result.branch).toBeTruthy();
    expect(fs.existsSync(path.join(targetDir, 'README.md'))).toBe(true);
  });

  it('generates ~/.ghostwork/{repo-name} as the default clone directory', async () => {
    const { defaultCloneDir } = await vi.importActual<typeof GitCloneModule>('../services/git-clone.js');

    expect(defaultCloneDir('https://github.com/org/my-project.git')).toBe(
      path.join(os.homedir(), '.ghostwork', 'my-project'),
    );
  });

  it('pulls when targetDir already contains the same repository', async () => {
    const targetDir = path.join(os.tmpdir(), `gw-pull-${Date.now()}`);
    cloneDirs.push(targetDir);

    await realClone(sourceDir, targetDir);
    const result = await realClone(sourceDir, targetDir);

    expect(result.cwd).toBe(targetDir);
  });

  it('throws when targetDir contains a different repository', async () => {
    const targetDir = path.join(os.tmpdir(), `gw-diff-${Date.now()}`);
    const otherSource = path.join(os.tmpdir(), `gw-other-${Date.now()}`);
    cloneDirs.push(targetDir, otherSource);

    initLocalRepo(otherSource);
    await realClone(sourceDir, targetDir);

    await expect(realClone(otherSource, targetDir)).rejects.toThrow(
      'already contains a different repository',
    );
  });

  it('throws with "git clone failed" for a non-existent repository path', async () => {
    const targetDir = path.join(os.tmpdir(), `gw-invalid-${Date.now()}`);
    cloneDirs.push(targetDir);

    await expect(
      realClone('/nonexistent/repo/path/does/not/exist', targetDir),
    ).rejects.toThrow('git clone failed');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Section 2: POST /projects/:projectId/workspace/clone API route
// ══════════════════════════════════════════════════════════════════════════════

// Valid UUIDs (v4 format: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx)
const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const COMPANY_ID = '00000000-0000-4000-8000-000000000002';
const REPO_URL = 'https://github.com/org/test-repo.git';

const mockProject = { id: PROJECT_ID, companyId: COMPANY_ID, name: 'Test Project', status: 'active' };

/**
 * Minimal Drizzle-like mock that satisfies the workspace-clone route's DB calls:
 *   db.select().from(...).where(...).limit(n)  → wsRows
 *   db.insert(...).values(...).returning()     → []
 *   db.update(...).set(...).where(...)         → (no .returning needed)
 */
function makeMockDb(wsRows: unknown[] = []): Db {
  const makeChain = (limitResult: unknown) => {
    const c: Record<string, unknown> = {};
    c['from'] = vi.fn().mockReturnValue(c);
    c['where'] = vi.fn().mockReturnValue(c);
    c['limit'] = vi.fn().mockResolvedValue(limitResult);
    c['values'] = vi.fn().mockReturnValue(c);
    c['set'] = vi.fn().mockReturnValue(c);
    c['returning'] = vi.fn().mockResolvedValue([]);
    return c;
  };

  return {
    select: vi.fn().mockImplementation(() => makeChain(wsRows)),
    insert: vi.fn().mockImplementation(() => makeChain([])),
    update: vi.fn().mockImplementation(() => makeChain([])),
  } as unknown as Db;
}

describe('POST /projects/:projectId/workspace/clone', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  const tmpDirs: string[] = [];

  beforeEach(() => {
    vi.mocked(projectService).mockReturnValue({
      getById: vi.fn().mockResolvedValue(mockProject),
    } as unknown as ReturnType<typeof projectService>);
  });

  afterEach(async () => {
    await app?.close();
    vi.clearAllMocks();
    for (const d of tmpDirs.splice(0)) rmrf(d);
  });

  it('returns 400 when repoUrl has an invalid format', async () => {
    app = await buildTestApp(makeMockDb());

    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT_ID}/workspace/clone`,
      payload: { repoUrl: 'not-a-valid-url' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    const errMsg = typeof body.error === 'string' ? body.error : body.error?.message ?? '';
    expect(errMsg).toMatch(/Invalid repository URL/);
  });

  it('returns 404 when the project does not exist', async () => {
    vi.mocked(projectService).mockReturnValue({
      getById: vi.fn().mockResolvedValue(null),
    } as unknown as ReturnType<typeof projectService>);
    app = await buildTestApp(makeMockDb());

    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT_ID}/workspace/clone`,
      payload: { repoUrl: REPO_URL, targetDir: '/tmp/no-such-project' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 201 and records workspace on fresh clone', async () => {
    // targetDir does not exist → stat throws ENOENT → cloned = true → 201
    const targetDir = path.join(os.tmpdir(), `gw-api-fresh-${Date.now()}`);
    vi.mocked(cloneRepository).mockResolvedValue({ cwd: targetDir, branch: 'main', cloned: true });
    app = await buildTestApp(makeMockDb([]));

    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT_ID}/workspace/clone`,
      payload: { repoUrl: REPO_URL, targetDir },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.cwd).toBe(targetDir);
    expect(body.branch).toBe('main');
    expect(body.repoUrl).toBe(REPO_URL);
    expect(body.cloned).toBe(true);
  });

  it('returns 200 when targetDir already exists (pull path)', async () => {
    // Create the directory so stat sees it → cloned = false → 200
    const targetDir = path.join(os.tmpdir(), `gw-api-pull-${Date.now()}`);
    fs.mkdirSync(targetDir, { recursive: true });
    tmpDirs.push(targetDir);

    vi.mocked(cloneRepository).mockResolvedValue({ cwd: targetDir, branch: 'main', cloned: false });
    app = await buildTestApp(makeMockDb([]));

    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT_ID}/workspace/clone`,
      payload: { repoUrl: REPO_URL, targetDir },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).cloned).toBe(false);
  });

  it('returns 400 when cloneRepository throws a generic error', async () => {
    vi.mocked(cloneRepository).mockRejectedValue(
      new Error('git clone failed: remote repository not found'),
    );
    app = await buildTestApp(makeMockDb([]));

    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT_ID}/workspace/clone`,
      payload: { repoUrl: REPO_URL, targetDir: '/tmp/target-err' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    const errMsg = typeof body.error === 'string' ? body.error : body.error?.message ?? '';
    expect(errMsg).toMatch(/git clone failed/);
  });

  it('returns 408 when cloneRepository times out', async () => {
    vi.mocked(cloneRepository).mockRejectedValue(
      new Error('git clone failed: connection timed out'),
    );
    app = await buildTestApp(makeMockDb([]));

    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT_ID}/workspace/clone`,
      payload: { repoUrl: REPO_URL, targetDir: '/tmp/target-timeout' },
    });

    expect(res.statusCode).toBe(408);
  });
});
