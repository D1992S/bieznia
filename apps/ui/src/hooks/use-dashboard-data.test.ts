import { describe, expect, it } from 'vitest';
import { buildDateRange, isDateRangeValid } from './use-dashboard-data.ts';

describe('use-dashboard-data helpers', () => {
  it('builds deterministic date range for preset days', () => {
    const range = buildDateRange(7, new Date('2026-02-12T18:45:00.000Z'));

    expect(range.dateFrom).toBe('2026-02-06');
    expect(range.dateTo).toBe('2026-02-12');
  });

  it('validates date range ordering', () => {
    expect(isDateRangeValid({ dateFrom: '2026-02-01', dateTo: '2026-02-28' })).toBe(true);
    expect(isDateRangeValid({ dateFrom: '2026-03-01', dateTo: '2026-02-28' })).toBe(false);
  });
});
