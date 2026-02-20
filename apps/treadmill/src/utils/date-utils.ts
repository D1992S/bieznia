import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addYears,
  subYears,
  addDays,
  subDays,
  isSameDay,
  getDay,
  getDaysInMonth,
  startOfYear,
} from 'date-fns';
import { pl } from 'date-fns/locale';

export {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addYears,
  subYears,
  addDays,
  subDays,
  isSameDay,
  getDay,
  getDaysInMonth,
  startOfYear,
};

export function formatDate(date: Date, pattern: string): string {
  return format(date, pattern, { locale: pl });
}

export function toDateString(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function fromDateString(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00');
}

export function getWeekDays(): string[] {
  return ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];
}

export function getMonthDays(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = getDaysInMonth(firstDay);
  let startDayOfWeek = getDay(firstDay);
  // Convert Sunday=0 to Monday-based (Mon=0, Sun=6)
  startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const days: Array<Date | null> = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}

export function getWeekRange(date: Date): { start: Date; end: Date } {
  return {
    start: startOfWeek(date, { weekStartsOn: 1 }),
    end: endOfWeek(date, { weekStartsOn: 1 }),
  };
}

export function getWeekDates(date: Date): Date[] {
  const { start, end } = getWeekRange(date);
  return eachDayOfInterval({ start, end });
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
