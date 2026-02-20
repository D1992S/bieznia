import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WeeklyGoal, MonthlyGoal } from '../types.ts';

interface GoalsState {
  weeklyGoal: WeeklyGoal;
  monthlyGoal: MonthlyGoal;
  setWeeklyGoal: (goal: WeeklyGoal) => void;
  setMonthlyGoal: (goal: MonthlyGoal) => void;
}

export const useGoalsStore = create<GoalsState>()(
  persist(
    (set) => ({
      weeklyGoal: { distanceKm: 10, sessions: 3, calories: 1000 },
      monthlyGoal: { distanceKm: 40, sessions: 12, calories: 4000 },
      setWeeklyGoal: (goal) => set({ weeklyGoal: goal }),
      setMonthlyGoal: (goal) => set({ monthlyGoal: goal }),
    }),
    { name: 'treadmill-goals' },
  ),
);
