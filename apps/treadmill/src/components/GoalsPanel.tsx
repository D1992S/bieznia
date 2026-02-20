import { useState } from 'react';
import { useGoalsStore } from '../stores/goals-store.ts';
import { useSessionsStore, getSessionsInRange } from '../stores/sessions-store.ts';
import {
  toDateString,
  getWeekRange,
  startOfMonth,
  endOfMonth,
} from '../utils/date-utils.ts';

export function GoalsPanel() {
  const { weeklyGoal, monthlyGoal, setWeeklyGoal, setMonthlyGoal } = useGoalsStore();
  const sessions = useSessionsStore((s) => s.sessions);
  const [editing, setEditing] = useState(false);

  const [wDist, setWDist] = useState(String(weeklyGoal.distanceKm));
  const [wSess, setWSess] = useState(String(weeklyGoal.sessions));
  const [wCal, setWCal] = useState(String(weeklyGoal.calories));
  const [mDist, setMDist] = useState(String(monthlyGoal.distanceKm));
  const [mSess, setMSess] = useState(String(monthlyGoal.sessions));
  const [mCal, setMCal] = useState(String(monthlyGoal.calories));

  const now = new Date();
  const { start: weekStart, end: weekEnd } = getWeekRange(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const weekSessions = getSessionsInRange(
    sessions,
    toDateString(weekStart),
    toDateString(weekEnd),
  );
  const monthSessions = getSessionsInRange(
    sessions,
    toDateString(monthStart),
    toDateString(monthEnd),
  );

  const weekProgress = {
    distance: weekSessions.reduce((s, x) => s + x.distanceKm, 0),
    sessions: weekSessions.length,
    calories: weekSessions.reduce((s, x) => s + x.caloriesBurned, 0),
  };

  const monthProgress = {
    distance: monthSessions.reduce((s, x) => s + x.distanceKm, 0),
    sessions: monthSessions.length,
    calories: monthSessions.reduce((s, x) => s + x.caloriesBurned, 0),
  };

  const handleSave = () => {
    setWeeklyGoal({
      distanceKm: parseFloat(wDist) || 10,
      sessions: parseInt(wSess) || 3,
      calories: parseInt(wCal) || 1000,
    });
    setMonthlyGoal({
      distanceKm: parseFloat(mDist) || 40,
      sessions: parseInt(mSess) || 12,
      calories: parseInt(mCal) || 4000,
    });
    setEditing(false);
  };



  return (
    <div className="card">
      <div className="flex items-center justify-between mb-16">
        <div className="card-title" style={{ marginBottom: 0 }}>
          Cele
        </div>
        <button className="btn btn-ghost" onClick={() => { setEditing(!editing); }}>
          {editing ? 'Anuluj' : 'Edytuj'}
        </button>
      </div>

      {editing ? (
        <div>
          <h4 style={{ marginBottom: 8 }}>Cel tygodniowy</h4>
          <div className="grid-3 mb-16">
            <div className="form-group">
              <label className="form-label">Dystans (km)</label>
              <input
                type="number"
                className="form-input"
                value={wDist}
                onChange={(e) => { setWDist(e.target.value); }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Sesje</label>
              <input
                type="number"
                className="form-input"
                value={wSess}
                onChange={(e) => { setWSess(e.target.value); }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Kalorie</label>
              <input
                type="number"
                className="form-input"
                value={wCal}
                onChange={(e) => { setWCal(e.target.value); }}
              />
            </div>
          </div>

          <h4 style={{ marginBottom: 8 }}>Cel miesieczny</h4>
          <div className="grid-3 mb-16">
            <div className="form-group">
              <label className="form-label">Dystans (km)</label>
              <input
                type="number"
                className="form-input"
                value={mDist}
                onChange={(e) => { setMDist(e.target.value); }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Sesje</label>
              <input
                type="number"
                className="form-input"
                value={mSess}
                onChange={(e) => { setMSess(e.target.value); }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Kalorie</label>
              <input
                type="number"
                className="form-input"
                value={mCal}
                onChange={(e) => { setMCal(e.target.value); }}
              />
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleSave} style={{ width: '100%' }}>
            Zapisz cele
          </button>
        </div>
      ) : (
        <div>
          <h4 style={{ marginBottom: 12 }}>Ten tydzien</h4>
          <GoalProgress
            label="Dystans"
            current={weekProgress.distance}
            goal={weeklyGoal.distanceKm}
            unit="km"
          />
          <GoalProgress
            label="Sesje"
            current={weekProgress.sessions}
            goal={weeklyGoal.sessions}
            unit=""
          />
          <GoalProgress
            label="Kalorie"
            current={weekProgress.calories}
            goal={weeklyGoal.calories}
            unit="kcal"
          />

          <h4 style={{ marginTop: 20, marginBottom: 12 }}>Ten miesiac</h4>
          <GoalProgress
            label="Dystans"
            current={monthProgress.distance}
            goal={monthlyGoal.distanceKm}
            unit="km"
          />
          <GoalProgress
            label="Sesje"
            current={monthProgress.sessions}
            goal={monthlyGoal.sessions}
            unit=""
          />
          <GoalProgress
            label="Kalorie"
            current={monthProgress.calories}
            goal={monthlyGoal.calories}
            unit="kcal"
          />
        </div>
      )}
    </div>
  );
}

function GoalProgress({
  label,
  current,
  goal,
  unit,
}: {
  label: string;
  current: number;
  goal: number;
  unit: string;
}) {
  const percentage = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  const displayCurrent = Number.isInteger(current) ? current : current.toFixed(1);

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 13 }}>
          {displayCurrent} / {goal} {unit}
          <span
            style={{
              marginLeft: 8,
              color: percentage >= 100 ? 'var(--accent-green)' : 'var(--text-muted)',
              fontWeight: 600,
            }}
          >
            {percentage}%
          </span>
        </span>
      </div>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{
            width: `${String(percentage)}%`,
            background:
              percentage >= 100
                ? 'var(--accent-green)'
                : percentage >= 50
                  ? 'var(--accent-blue)'
                  : 'var(--accent-yellow)',
          }}
        />
      </div>
    </div>
  );
}
