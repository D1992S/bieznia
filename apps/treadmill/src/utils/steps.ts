export function calculateSteps(distanceKm: number, strideLengthM: number): number {
  if (distanceKm <= 0 || strideLengthM <= 0) return 0;
  return Math.round((distanceKm * 1000) / strideLengthM);
}
