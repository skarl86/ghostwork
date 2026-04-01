/**
 * State machine unit tests — all valid/invalid transitions.
 */

import { describe, it, expect } from 'vitest';
import {
  canTransition,
  transition,
  isTerminal,
  type RunStatus,
} from '../../heartbeat/state-machine.js';

describe('Run State Machine', () => {
  describe('valid transitions', () => {
    it.each<[RunStatus, RunStatus]>([
      ['queued', 'running'],
      ['queued', 'queued'], // coalescing
      ['queued', 'deferred_issue_execution'],
      ['queued', 'cancelled'], // direct cancel
      ['deferred_issue_execution', 'cancelled'], // cancel while deferred
      ['running', 'succeeded'],
      ['running', 'failed'],
      ['running', 'cancelled'],
      ['running', 'timed_out'],
      ['deferred_issue_execution', 'queued'], // promotion
      ['failed', 'queued'], // auto-retry
    ])('%s → %s (valid)', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
      expect(() => transition(from, to)).not.toThrow();
      expect(transition(from, to)).toBe(to);
    });
  });

  describe('invalid transitions', () => {
    it.each<[RunStatus, RunStatus]>([
      ['queued', 'succeeded'],
      ['queued', 'failed'],
      ['queued', 'timed_out'],
      ['running', 'queued'],
      ['running', 'deferred_issue_execution'],
      ['running', 'running'],
      ['succeeded', 'running'],
      ['succeeded', 'queued'],
      ['succeeded', 'failed'],
      ['cancelled', 'running'],
      ['cancelled', 'queued'],
      ['timed_out', 'running'],
      ['timed_out', 'queued'],
      ['failed', 'running'],
      ['failed', 'succeeded'],
      ['deferred_issue_execution', 'running'],
      ['deferred_issue_execution', 'succeeded'],
      ['deferred_issue_execution', 'failed'],
      ['deferred_issue_execution', 'timed_out'],
      ['deferred_issue_execution', 'deferred_issue_execution'], // self-transition
      ['failed', 'failed'], // self-transition
      ['failed', 'cancelled'],
      ['failed', 'timed_out'],
      ['failed', 'deferred_issue_execution'],
      ['succeeded', 'succeeded'], // self-transition
      ['succeeded', 'cancelled'],
      ['succeeded', 'timed_out'],
      ['succeeded', 'deferred_issue_execution'],
      ['cancelled', 'cancelled'], // self-transition
      ['cancelled', 'succeeded'],
      ['cancelled', 'failed'],
      ['cancelled', 'timed_out'],
      ['cancelled', 'deferred_issue_execution'],
      ['timed_out', 'timed_out'], // self-transition
      ['timed_out', 'succeeded'],
      ['timed_out', 'failed'],
      ['timed_out', 'cancelled'],
      ['timed_out', 'deferred_issue_execution'],
    ])('%s → %s (invalid)', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
      expect(() => transition(from, to)).toThrow(/invalid transition/i);
    });
  });

  describe('isTerminal', () => {
    it('succeeded is terminal', () => {
      expect(isTerminal('succeeded')).toBe(true);
    });

    it('cancelled is terminal', () => {
      expect(isTerminal('cancelled')).toBe(true);
    });

    it('timed_out is terminal', () => {
      expect(isTerminal('timed_out')).toBe(true);
    });

    it('queued is NOT terminal', () => {
      expect(isTerminal('queued')).toBe(false);
    });

    it('running is NOT terminal', () => {
      expect(isTerminal('running')).toBe(false);
    });

    it('failed is NOT terminal (can retry)', () => {
      expect(isTerminal('failed')).toBe(false);
    });

    it('deferred_issue_execution is NOT terminal', () => {
      expect(isTerminal('deferred_issue_execution')).toBe(false);
    });
  });
});
