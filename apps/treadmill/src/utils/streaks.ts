import type { Achievement, TreadmillSession } from '../types.ts';
import { subDays, toDateString } from './date-utils.ts';

export function calculateCurrentStreak(sessions: TreadmillSession[]): number {
  if (sessions.length === 0) return 0;

  const sessionDates = new Set(sessions.map((s) => s.date));
  let streak = 0;
  let checkDate = new Date();

  // Check if today has a session, if not start from yesterday
  if (!sessionDates.has(toDateString(checkDate))) {
    checkDate = subDays(checkDate, 1);
    if (!sessionDates.has(toDateString(checkDate))) {
      return 0;
    }
  }

  while (sessionDates.has(toDateString(checkDate))) {
    streak++;
    checkDate = subDays(checkDate, 1);
  }

  return streak;
}

export function calculateLongestStreak(sessions: TreadmillSession[]): number {
  if (sessions.length === 0) return 0;

  const dates = [...new Set(sessions.map((s) => s.date))].sort();
  let longest = 1;
  let current = 1;

  for (let i = 1; i < dates.length; i++) {
    const prevDate = dates[i - 1];
    const currDate = dates[i];
    if (!prevDate || !currDate) continue;
    const prev = new Date(prevDate + 'T00:00:00');
    const curr = new Date(currDate + 'T00:00:00');
    const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}

function totalDistance(sessions: TreadmillSession[]): number {
  return sessions.reduce((sum, s) => sum + s.distanceKm, 0);
}

function totalCalories(sessions: TreadmillSession[]): number {
  return sessions.reduce((sum, s) => sum + s.caloriesBurned, 0);
}

function longestSessionMinutes(sessions: TreadmillSession[]): number {
  if (sessions.length === 0) return 0;
  return Math.max(...sessions.map((s) => s.durationSeconds / 60));
}

export function getAchievements(sessions: TreadmillSession[]): Achievement[] {
  const dist = totalDistance(sessions);
  const cal = totalCalories(sessions);
  const count = sessions.length;
  const longestMin = longestSessionMinutes(sessions);
  const streak = calculateLongestStreak(sessions);

  const achievements: Achievement[] = [
    // Distance milestones
    { id: 'dist-10', name: 'Pierwszy krok', description: 'Przejdź 10 km łącznie', icon: '🚶', unlockedAt: dist >= 10 ? 'yes' : null },
    { id: 'dist-50', name: 'Maratończyk', description: 'Przejdź 50 km łącznie', icon: '🏃', unlockedAt: dist >= 50 ? 'yes' : null },
    { id: 'dist-100', name: 'Setka!', description: 'Przejdź 100 km łącznie', icon: '💯', unlockedAt: dist >= 100 ? 'yes' : null },
    { id: 'dist-500', name: 'Pół tysiąca', description: 'Przejdź 500 km łącznie', icon: '🗺️', unlockedAt: dist >= 500 ? 'yes' : null },
    { id: 'dist-1000', name: 'Tysiącznik', description: 'Przejdź 1000 km łącznie', icon: '🌍', unlockedAt: dist >= 1000 ? 'yes' : null },

    // Session count milestones
    { id: 'sess-10', name: 'Początkujący', description: '10 sesji treningowych', icon: '⭐', unlockedAt: count >= 10 ? 'yes' : null },
    { id: 'sess-25', name: 'Regularny', description: '25 sesji treningowych', icon: '🌟', unlockedAt: count >= 25 ? 'yes' : null },
    { id: 'sess-50', name: 'Weteran', description: '50 sesji treningowych', icon: '🏅', unlockedAt: count >= 50 ? 'yes' : null },
    { id: 'sess-100', name: 'Centurion', description: '100 sesji treningowych', icon: '🏆', unlockedAt: count >= 100 ? 'yes' : null },
    { id: 'sess-365', name: 'Roczny mistrz', description: '365 sesji treningowych', icon: '👑', unlockedAt: count >= 365 ? 'yes' : null },

    // Calorie milestones
    { id: 'cal-1000', name: 'Spalacz', description: 'Spal 1000 kcal łącznie', icon: '🔥', unlockedAt: cal >= 1000 ? 'yes' : null },
    { id: 'cal-5000', name: 'Piec', description: 'Spal 5000 kcal łącznie', icon: '🔥', unlockedAt: cal >= 5000 ? 'yes' : null },
    { id: 'cal-10000', name: 'Wulkan', description: 'Spal 10 000 kcal łącznie', icon: '🌋', unlockedAt: cal >= 10000 ? 'yes' : null },
    { id: 'cal-50000', name: 'Supernowa', description: 'Spal 50 000 kcal łącznie', icon: '💥', unlockedAt: cal >= 50000 ? 'yes' : null },

    // Duration milestones
    { id: 'dur-30', name: 'Pół godziny', description: 'Sesja trwająca 30+ minut', icon: '⏱️', unlockedAt: longestMin >= 30 ? 'yes' : null },
    { id: 'dur-60', name: 'Godzina!', description: 'Sesja trwająca 60+ minut', icon: '⏰', unlockedAt: longestMin >= 60 ? 'yes' : null },
    { id: 'dur-90', name: 'Półtora', description: 'Sesja trwająca 90+ minut', icon: '🕐', unlockedAt: longestMin >= 90 ? 'yes' : null },
    { id: 'dur-120', name: 'Dwugodzinny', description: 'Sesja trwająca 120+ minut', icon: '🕑', unlockedAt: longestMin >= 120 ? 'yes' : null },

    // Streak milestones
    { id: 'streak-3', name: '3 dni', description: 'Streak 3 dni pod rząd', icon: '📅', unlockedAt: streak >= 3 ? 'yes' : null },
    { id: 'streak-7', name: 'Tydzień!', description: 'Streak 7 dni pod rząd', icon: '🗓️', unlockedAt: streak >= 7 ? 'yes' : null },
    { id: 'streak-30', name: 'Miesiąc!', description: 'Streak 30 dni pod rząd', icon: '📆', unlockedAt: streak >= 30 ? 'yes' : null },
  ];

  return achievements;
}
