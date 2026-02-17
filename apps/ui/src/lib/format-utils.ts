export function formatNumber(value: number): string {
  return new Intl.NumberFormat('pl-PL').format(Math.round(value));
}

export function formatDateTick(dateIso: string): string {
  const parsed = new Date(`${dateIso}T00:00:00Z`);
  return parsed.toLocaleDateString('pl-PL', { day: '2-digit', month: 'short' });
}
