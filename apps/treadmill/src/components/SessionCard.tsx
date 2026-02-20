import type { TreadmillSession } from '../types.ts';
import { formatDuration } from '../utils/date-utils.ts';
import { ZONE_LABELS, ZONE_COLORS } from '../utils/pace.ts';
import { useSessionsStore } from '../stores/sessions-store.ts';

interface SessionCardProps {
  session: TreadmillSession;
}

export function SessionCard({ session }: SessionCardProps) {
  const deleteSession = useSessionsStore((s) => s.deleteSession);

  return (
    <div className="session-card">
      <div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
          {new Date(session.startTime).toLocaleTimeString('pl-PL', {
            hour: '2-digit',
            minute: '2-digit',
          })}
          {session.notes && (
            <span style={{ marginLeft: 8, fontStyle: 'italic' }}>{session.notes}</span>
          )}
        </div>
        <span
          className="zone-badge"
          style={{
            background: ZONE_COLORS[session.intensityZone] + '22',
            color: ZONE_COLORS[session.intensityZone],
          }}
        >
          {ZONE_LABELS[session.intensityZone]}
        </span>
      </div>
      <div className="session-stats">
        <div className="session-stat">
          <div className="session-stat-value">{session.distanceKm.toFixed(1)}</div>
          <div className="session-stat-label">km</div>
        </div>
        <div className="session-stat">
          <div className="session-stat-value">{formatDuration(session.durationSeconds)}</div>
          <div className="session-stat-label">czas</div>
        </div>
        <div className="session-stat">
          <div className="session-stat-value">{session.caloriesBurned}</div>
          <div className="session-stat-label">kcal</div>
        </div>
        <div className="session-stat">
          <div className="session-stat-value">{session.steps.toLocaleString('pl-PL')}</div>
          <div className="session-stat-label">kroki</div>
        </div>
        <div className="session-stat">
          <div className="session-stat-value">{session.avgPaceMinPerKm.toFixed(1)}</div>
          <div className="session-stat-label">min/km</div>
        </div>
      </div>
      <button className="delete-btn" onClick={() => { deleteSession(session.id); }} title="Usun">
        ✕
      </button>
    </div>
  );
}
