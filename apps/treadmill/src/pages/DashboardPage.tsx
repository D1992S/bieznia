import { useState } from 'react';
import { Timer } from '../components/Timer.tsx';
import { SessionForm } from '../components/SessionForm.tsx';
import { SessionCard } from '../components/SessionCard.tsx';
import { useSessionsStore } from '../stores/sessions-store.ts';
import { useProfileStore } from '../stores/profile-store.ts';
import { calculateCurrentStreak } from '../utils/streaks.ts';
import { toDateString, getWeekRange } from '../utils/date-utils.ts';
import { getSessionsInRange } from '../stores/sessions-store.ts';

interface PendingSession {
  durationSeconds: number;
  startTime: string;
  endTime: string;
}

export function DashboardPage() {
  const [pending, setPending] = useState<PendingSession | null>(null);
  const sessions = useSessionsStore((s) => s.sessions);
  const profile = useProfileStore((s) => s.profile);

  const today = toDateString(new Date());
  const todaySessions = sessions.filter((s) => s.date === today);
  const todayDistance = todaySessions.reduce((sum, s) => sum + s.distanceKm, 0);
  const todayCalories = todaySessions.reduce((sum, s) => sum + s.caloriesBurned, 0);
  const todaySteps = todaySessions.reduce((sum, s) => sum + s.steps, 0);

  const { start, end } = getWeekRange(new Date());
  const weekSessions = getSessionsInRange(sessions, toDateString(start), toDateString(end));
  const weekDistance = weekSessions.reduce((sum, s) => sum + s.distanceKm, 0);

  const currentStreak = calculateCurrentStreak(sessions);

  const handleSessionEnd = (durationSeconds: number, startTime: string, endTime: string) => {
    setPending({ durationSeconds, startTime, endTime });
  };

  if (!profile) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
        <h2 style={{ marginBottom: 8 }}>Witaj!</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Przejdz do zakladki <strong>Profil</strong> aby ustawic swoje dane (waga, wzrost, wiek).
          <br />
          Potem wroc tutaj zeby rozpoczac trening!
        </p>
      </div>
    );
  }

  return (
    <div className="flex-col gap-24" style={{ display: 'flex', gap: 24 }}>
      {/* Quick stats */}
      <div className="grid-4">
        <div className="card text-center">
          <div className="stat-label">Dzis dystans</div>
          <div className="stat-value">{todayDistance.toFixed(1)} km</div>
        </div>
        <div className="card text-center">
          <div className="stat-label">Dzis kalorie</div>
          <div className="stat-value">{todayCalories} kcal</div>
        </div>
        <div className="card text-center">
          <div className="stat-label">Dzis kroki</div>
          <div className="stat-value">{todaySteps.toLocaleString('pl-PL')}</div>
        </div>
        <div className="card text-center">
          <div className="stat-label">Streak</div>
          <div className="stat-value">
            {currentStreak} {currentStreak === 1 ? 'dzien' : 'dni'}
          </div>
        </div>
      </div>

      {/* Week summary */}
      <div className="card">
        <div className="card-title">Ten tydzien</div>
        <div className="flex items-center justify-between">
          <div>
            <span style={{ fontSize: 24, fontWeight: 700 }}>{weekDistance.toFixed(1)} km</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
              ({weekSessions.length} sesji)
            </span>
          </div>
        </div>
      </div>

      {/* Timer or Session Form */}
      {pending ? (
        <SessionForm
          durationSeconds={pending.durationSeconds}
          startTime={pending.startTime}
          endTime={pending.endTime}
          onSaved={() => { setPending(null); }}
          onCancel={() => { setPending(null); }}
        />
      ) : (
        <Timer onSessionEnd={handleSessionEnd} />
      )}

      {/* Recent sessions */}
      {todaySessions.length > 0 && (
        <div>
          <div className="card-title mb-8">Dzisiejsze sesje</div>
          {todaySessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
