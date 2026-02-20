const MET_TABLE: Array<{ maxSpeed: number; met: number }> = [
  { maxSpeed: 3.0, met: 2.0 },
  { maxSpeed: 4.0, met: 2.8 },
  { maxSpeed: 5.0, met: 3.5 },
  { maxSpeed: 6.5, met: 4.3 },
  { maxSpeed: 8.0, met: 5.0 },
  { maxSpeed: 9.5, met: 8.0 },
  { maxSpeed: 11.0, met: 9.8 },
  { maxSpeed: Infinity, met: 11.0 },
];

export function getMetForSpeed(speedKmh: number): number {
  for (const entry of MET_TABLE) {
    if (speedKmh <= entry.maxSpeed) {
      return entry.met;
    }
  }
  return 11.0;
}

export function calculateCalories(
  distanceKm: number,
  durationSeconds: number,
  weightKg: number,
): number {
  if (durationSeconds <= 0 || distanceKm <= 0 || weightKg <= 0) return 0;
  const durationHours = durationSeconds / 3600;
  const speedKmh = distanceKm / durationHours;
  const met = getMetForSpeed(speedKmh);
  return Math.round(met * weightKg * durationHours);
}
