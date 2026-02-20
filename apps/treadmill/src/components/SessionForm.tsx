import { useState } from 'react';
import type { TreadmillSession } from '../types.ts';
import { useProfileStore } from '../stores/profile-store.ts';
import { useSessionsStore } from '../stores/sessions-store.ts';
import { calculateCalories } from '../utils/calories.ts';
import { calculateSteps } from '../utils/steps.ts';
import { calculatePace, calculateSpeed, getIntensityZone } from '../utils/pace.ts';
import { toDateString, formatDuration } from '../utils/date-utils.ts';

interface SessionFormProps {
  durationSeconds: number;
  startTime: string;
  endTime: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function SessionForm({
  durationSeconds,
  startTime,
  endTime,
  onSaved,
  onCancel,
}: SessionFormProps) {
  const [distanceKm, setDistanceKm] = useState('');
  const [notes, setNotes] = useState('');
  const profile = useProfileStore((s) => s.profile);
  const addSession = useSessionsStore((s) => s.addSession);

  const distance = parseFloat(distanceKm) || 0;
  const weight = profile?.weight ?? 70;
  const stride = profile?.strideLength ?? 0.7;

  const calories = calculateCalories(distance, durationSeconds, weight);
  const steps = calculateSteps(distance, stride);
  const pace = calculatePace(distance, durationSeconds);
  const speed = calculateSpeed(distance, durationSeconds);
  const zone = getIntensityZone(pace);

  const handleSave = () => {
    if (distance <= 0) return;

    const session: TreadmillSession = {
      id: crypto.randomUUID(),
      date: toDateString(new Date(startTime)),
      startTime,
      endTime,
      durationSeconds,
      distanceKm: distance,
      steps,
      caloriesBurned: calories,
      avgPaceMinPerKm: pace,
      speedKmh: speed,
      intensityZone: zone,
      notes,
    };

    addSession(session);
    onSaved();
  };

  return (
    <div className="card">
      <div className="card-title">Zapisz sesje</div>

      <div className="mb-16" style={{ textAlign: 'center' }}>
        <div className="stat-label">Czas trwania</div>
        <div className="stat-value">{formatDuration(durationSeconds)}</div>
      </div>

      <div className="form-group">
        <label className="form-label">Dystans (km)</label>
        <input
          type="number"
          className="form-input"
          value={distanceKm}
          onChange={(e) => { setDistanceKm(e.target.value); }}
          placeholder="np. 3.5"
          step="0.1"
          min="0"
          autoFocus
        />
      </div>

      {distance > 0 && (
        <div className="grid-4 mb-16">
          <div className="text-center">
            <div className="session-stat-value">{calories}</div>
            <div className="session-stat-label">kcal</div>
          </div>
          <div className="text-center">
            <div className="session-stat-value">{steps.toLocaleString('pl-PL')}</div>
            <div className="session-stat-label">kroki</div>
          </div>
          <div className="text-center">
            <div className="session-stat-value">{pace.toFixed(1)}</div>
            <div className="session-stat-label">min/km</div>
          </div>
          <div className="text-center">
            <div className="session-stat-value">{speed.toFixed(1)}</div>
            <div className="session-stat-label">km/h</div>
          </div>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Notatki (opcjonalne)</label>
        <input
          type="text"
          className="form-input"
          value={notes}
          onChange={(e) => { setNotes(e.target.value); }}
          placeholder="np. dobre samopoczucie"
        />
      </div>

      <div className="flex gap-8">
        <button
          className="btn btn-success"
          onClick={handleSave}
          disabled={distance <= 0}
          style={{ flex: 1, opacity: distance <= 0 ? 0.5 : 1 }}
        >
          Zapisz sesje
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>
          Anuluj
        </button>
      </div>
    </div>
  );
}
