export interface UserProfile {
  name: string;
  weight: number;
  height: number;
  age: number;
  strideLength: number;
  gender: 'male' | 'female';
}

export type IntensityZone = 'walk' | 'brisk' | 'fast' | 'jog' | 'run';

export interface TreadmillSession {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  distanceKm: number;
  steps: number;
  caloriesBurned: number;
  avgPaceMinPerKm: number;
  speedKmh: number;
  intensityZone: IntensityZone;
  notes: string;
}

export interface WeeklyGoal {
  distanceKm: number;
  sessions: number;
  calories: number;
}

export interface MonthlyGoal {
  distanceKm: number;
  sessions: number;
  calories: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: string | null;
}

export type TabId = 'dashboard' | 'calendar' | 'stats' | 'profile';

export type CalendarView = 'day' | 'week' | 'month' | 'year';

export interface DaySummary {
  date: string;
  totalDistance: number;
  totalCalories: number;
  totalSteps: number;
  totalDuration: number;
  sessionCount: number;
}
