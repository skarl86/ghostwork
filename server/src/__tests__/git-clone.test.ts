/**
 * Unit tests for the git-clone service.
 * Tests URL parsing and default path generation without hitting the filesystem.
 */

import { describe, it, expect } from 'vitest';
import { extractRepoName, defaultCloneDir } from '../services/git-clone.js';
import os from 'node:os';
import path from 'node:path';

describe('extractRepoName', () => {
  it('parses HTTPS URL with .git suffix', () => {
    expect(extractRepoName('https://github.com/org/my-repo.git')).toBe('my-repo');
  });

  it('parses HTTPS URL without .git suffix', () => {
    expect(extractRepoName('https://github.com/org/my-repo')).toBe('my-repo');
  });

  it('parses SSH URL with .git suffix', () => {
    expect(extractRepoName('git@github.com:org/my-repo.git')).toBe('my-repo');
  });

  it('parses SSH URL without .git suffix', () => {
    expect(extractRepoName('git@github.com:org/my-repo')).toBe('my-repo');
  });

  it('handles trailing slashes', () => {
    expect(extractRepoName('https://github.com/org/my-repo/')).toBe('my-repo');
  });

  it('handles nested paths', () => {
    expect(extractRepoName('https://gitlab.com/group/sub/project.git')).toBe('project');
  });

  it('handles simple repo name with no path', () => {
    expect(extractRepoName('https://github.com/repo.git')).toBe('repo');
  });
});

describe('defaultCloneDir', () => {
  it('returns ~/.ghostwork/{repo-name}', () => {
    const result = defaultCloneDir('https://github.com/org/my-repo.git');
    expect(result).toBe(path.join(os.homedir(), '.ghostwork', 'my-repo'));
  });

  it('works with SSH URLs', () => {
    const result = defaultCloneDir('git@github.com:org/another-repo.git');
    expect(result).toBe(path.join(os.homedir(), '.ghostwork', 'another-repo'));
  });

  it('works with URLs without .git suffix', () => {
    const result = defaultCloneDir('https://github.com/org/no-suffix');
    expect(result).toBe(path.join(os.homedir(), '.ghostwork', 'no-suffix'));
  });
});
