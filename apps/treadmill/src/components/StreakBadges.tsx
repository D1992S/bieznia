import { useSessionsStore } from '../stores/sessions-store.ts';
import {
  getAchievements,
  calculateCurrentStreak,
  calculateLongestStreak,
} from '../utils/streaks.ts';

export function StreakBadges() {
  const sessions = useSessionsStore((s) => s.sessions);
  const achievements = getAchievements(sessions);
  const currentStreak = calculateCurrentStreak(sessions);
  const longestStreak = calculateLongestStreak(sessions);

  const unlocked = achievements.filter((a) => a.unlockedAt !== null);
  const locked = achievements.filter((a) => a.unlockedAt === null);

  return (
    <div className="card">
      <div className="card-title">Streak i osiagniecia</div>

      <div className="grid-2 mb-16">
        <div
          style={{
            padding: 16,
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent-green)' }}>
            {currentStreak}
          </div>
          <div className="stat-label">aktualny streak (dni)</div>
        </div>
        <div
          style={{
            padding: 16,
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent-yellow)' }}>
            {longestStreak}
          </div>
          <div className="stat-label">najdluzszy streak (dni)</div>
        </div>
      </div>

      <div className="card-title">
        Odblokowane ({unlocked.length}/{achievements.length})
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {unlocked.map((a) => (
          <div key={a.id} className="badge">
            <span className="badge-icon">{a.icon}</span>
            <div className="badge-info">
              <div className="badge-name">{a.name}</div>
              <div className="badge-desc">{a.description}</div>
            </div>
          </div>
        ))}
        {locked.map((a) => (
          <div key={a.id} className="badge locked">
            <span className="badge-icon">{a.icon}</span>
            <div className="badge-info">
              <div className="badge-name">{a.name}</div>
              <div className="badge-desc">{a.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
