import type { IntensityZone } from '../types.ts';

export function calculatePace(distanceKm: number, durationSeconds: number): number {
  if (distanceKm <= 0 || durationSeconds <= 0) return 0;
  return (durationSeconds / 60) / distanceKm;
}

export function calculateSpeed(distanceKm: number, durationSeconds: number): number {
  if (distanceKm <= 0 || durationSeconds <= 0) return 0;
  return distanceKm / (durationSeconds / 3600);
}

export function getIntensityZone(paceMinPerKm: number): IntensityZone {
  if (paceMinPerKm <= 0) return 'walk';
  if (paceMinPerKm < 6) return 'run';
  if (paceMinPerKm < 8) return 'jog';
  if (paceMinPerKm < 10) return 'fast';
  if (paceMinPerKm < 12) return 'brisk';
  return 'walk';
}

export const ZONE_LABELS: Record<IntensityZone, string> = {
  walk: 'Spacer',
  brisk: 'Szybki marsz',
  fast: 'B. szybki marsz',
  jog: 'Trucht',
  run: 'Bieg',
};

export const ZONE_COLORS: Record<IntensityZone, string> = {
  walk: '#22c55e',
  brisk: '#84cc16',
  fast: '#eab308',
  jog: '#f97316',
  run: '#ef4444',
};
