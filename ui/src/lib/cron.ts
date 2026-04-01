/**
 * Cron expression parser/formatter
 * Supports standard 5-field cron: minute hour day-of-month month day-of-week
 */

export interface CronParts {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

export function parseCron(expression: string): CronParts | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) return null;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function describeField(value: string, names?: string[]): string {
  if (value === '*') return 'every';
  if (value.includes('/')) {
    const [, step] = value.split('/');
    return `every ${step}`;
  }
  if (value.includes(',')) {
    const parts = value.split(',').map((v) => (names ? (names[Number(v)] ?? v) : v));
    return parts.join(', ');
  }
  if (value.includes('-')) {
    const [from, to] = value.split('-');
    const fromName = names ? (names[Number(from)] ?? from) : from;
    const toName = names ? (names[Number(to)] ?? to) : to;
    return `${fromName} through ${toName}`;
  }
  return names ? (names[Number(value)] ?? value) : value;
}

export function describeCron(expression: string): string {
  const parts = parseCron(expression);
  if (!parts) return 'Invalid cron expression';

  const { minute, hour, dayOfMonth, month, dayOfWeek } = parts;

  // Common patterns
  if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Every minute';
  }

  if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const step = minute.split('/')[1];
    return `Every ${step} minutes`;
  }

  if (hour.startsWith('*/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const step = hour.split('/')[1];
    return `Every ${step} hours` + (minute !== '0' && minute !== '*' ? ` at minute ${minute}` : '');
  }

  const segments: string[] = [];

  // Time
  if (minute !== '*' && hour !== '*' && !minute.includes('/') && !hour.includes('/')) {
    const h = hour.padStart(2, '0');
    const m = minute.padStart(2, '0');
    segments.push(`At ${h}:${m}`);
  } else {
    if (minute !== '*') segments.push(`minute ${describeField(minute)}`);
    if (hour !== '*') segments.push(`hour ${describeField(hour)}`);
  }

  if (dayOfMonth !== '*') segments.push(`on day ${describeField(dayOfMonth)} of the month`);
  if (month !== '*') segments.push(`in ${describeField(month, MONTHS)}`);
  if (dayOfWeek !== '*') segments.push(`on ${describeField(dayOfWeek, DAYS)}`);

  return segments.join(', ') || 'Every minute';
}
