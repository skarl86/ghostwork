import { describe, it, expect, beforeEach } from 'vitest';

// Test the search filtering logic that CommandPalette relies on
// The actual filtering happens server-side via useSearch, but we test
// the local helpers: recent searches storage

const RECENT_KEY = 'commandPalette:recent';

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function addRecentSearch(query: string, maxRecent = 5) {
  const recent = getRecentSearches().filter((q) => q !== query);
  recent.unshift(query);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, maxRecent)));
}

describe('CommandPalette search helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getRecentSearches returns empty array when no data', () => {
    expect(getRecentSearches()).toEqual([]);
  });

  it('addRecentSearch stores queries', () => {
    addRecentSearch('agents');
    expect(getRecentSearches()).toEqual(['agents']);
  });

  it('addRecentSearch deduplicates', () => {
    addRecentSearch('agents');
    addRecentSearch('issues');
    addRecentSearch('agents');
    expect(getRecentSearches()).toEqual(['agents', 'issues']);
  });

  it('addRecentSearch limits to max', () => {
    for (let i = 0; i < 10; i++) {
      addRecentSearch(`query-${i}`);
    }
    expect(getRecentSearches()).toHaveLength(5);
    expect(getRecentSearches()[0]).toBe('query-9');
  });

  it('most recent is first', () => {
    addRecentSearch('first');
    addRecentSearch('second');
    addRecentSearch('third');
    expect(getRecentSearches()[0]).toBe('third');
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(RECENT_KEY, 'not-json');
    expect(getRecentSearches()).toEqual([]);
  });
});
