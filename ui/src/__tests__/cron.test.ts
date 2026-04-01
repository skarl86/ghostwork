import { describe, it, expect } from 'vitest';
import { parseCron, describeCron } from '../lib/cron';

describe('parseCron', () => {
  it('parses valid 5-field cron', () => {
    const result = parseCron('0 9 * * 1-5');
    expect(result).toEqual({
      minute: '0',
      hour: '9',
      dayOfMonth: '*',
      month: '*',
      dayOfWeek: '1-5',
    });
  });

  it('returns null for invalid expressions', () => {
    expect(parseCron('')).toBeNull();
    expect(parseCron('0 9 *')).toBeNull();
    expect(parseCron('0 9 * * * *')).toBeNull();
  });

  it('handles extra whitespace', () => {
    const result = parseCron('  */5  *  *  *  *  ');
    expect(result).not.toBeNull();
    expect(result?.minute).toBe('*/5');
  });
});

describe('describeCron', () => {
  it('every minute', () => {
    expect(describeCron('* * * * *')).toBe('Every minute');
  });

  it('every N minutes', () => {
    expect(describeCron('*/5 * * * *')).toBe('Every 5 minutes');
    expect(describeCron('*/15 * * * *')).toBe('Every 15 minutes');
  });

  it('every N hours', () => {
    expect(describeCron('0 */2 * * *')).toBe('Every 2 hours');
  });

  it('specific time on weekdays', () => {
    const desc = describeCron('0 9 * * 1-5');
    expect(desc).toContain('09:00');
    expect(desc).toContain('Monday through Friday');
  });

  it('specific time daily', () => {
    const desc = describeCron('30 14 * * *');
    expect(desc).toContain('14:30');
  });

  it('returns error for invalid', () => {
    expect(describeCron('bad')).toBe('Invalid cron expression');
  });
});
