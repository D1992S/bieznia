import { useSessionsStore } from '../stores/sessions-store.ts';
import { ZONE_LABELS, ZONE_COLORS } from '../utils/pace.ts';
import type { IntensityZone } from '../types.ts';

const ZONES: IntensityZone[] = ['walk', 'brisk', 'fast', 'jog', 'run'];

export function PaceDisplay() {
  const sessions = useSessionsStore((s) => s.sessions);

  if (sessions.length === 0) {
    return (
      <div className="card">
        <div className="card-title">Tempo i strefy</div>
        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
          Brak sesji do analizy
        </div>
      </div>
    );
  }

  const zoneCounts = new Map<IntensityZone, number>();
  for (const s of sessions) {
    zoneCounts.set(s.intensityZone, (zoneCounts.get(s.intensityZone) ?? 0) + 1);
  }

  const avgPace =
    sessions.reduce((sum, s) => sum + s.avgPaceMinPerKm, 0) / sessions.length;
  const avgSpeed =
    sessions.reduce((sum, s) => sum + s.speedKmh, 0) / sessions.length;
  const bestPace = Math.min(...sessions.map((s) => s.avgPaceMinPerKm));

  return (
    <div className="card">
      <div className="card-title">Tempo i strefy</div>

      <div className="grid-3 mb-16">
        <div className="text-center">
          <div style={{ fontSize: 22, fontWeight: 700 }}>{avgPace.toFixed(1)}</div>
          <div className="stat-label">sr. tempo (min/km)</div>
        </div>
        <div className="text-center">
          <div style={{ fontSize: 22, fontWeight: 700 }}>{avgSpeed.toFixed(1)}</div>
          <div className="stat-label">sr. predkosc (km/h)</div>
        </div>
        <div className="text-center">
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-green)' }}>
            {bestPace.toFixed(1)}
          </div>
          <div className="stat-label">najlepsze tempo</div>
        </div>
      </div>

      <div className="card-title" style={{ marginTop: 8 }}>
        Rozklad stref
      </div>
      {ZONES.map((zone) => {
        const count = zoneCounts.get(zone) ?? 0;
        const pct = Math.round((count / sessions.length) * 100);
        return (
          <div key={zone} style={{ marginBottom: 8 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <span
                className="zone-badge"
                style={{
                  background: ZONE_COLORS[zone] + '22',
                  color: ZONE_COLORS[zone],
                }}
              >
                {ZONE_LABELS[zone]}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {count} sesji ({pct}%)
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${String(pct)}%`,
                  background: ZONE_COLORS[zone],
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
