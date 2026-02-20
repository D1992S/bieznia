export interface BmiResult {
  value: number;
  category: string;
  color: string;
}

export function calculateBmi(weightKg: number, heightCm: number): BmiResult | null {
  if (weightKg <= 0 || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  const value = weightKg / (heightM * heightM);

  if (value < 18.5) return { value, category: 'Niedowaga', color: '#f59e0b' };
  if (value < 25) return { value, category: 'Norma', color: '#22c55e' };
  if (value < 30) return { value, category: 'Nadwaga', color: '#f97316' };
  return { value, category: 'Otyłość', color: '#ef4444' };
}
