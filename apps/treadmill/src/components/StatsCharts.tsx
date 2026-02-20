import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TreadmillSession } from '../types.ts';

interface ChartData {
  label: string;
  distance: number;
  calories: number;
  steps: number;
  pace: number;
}

interface StatsChartsProps {
  data: ChartData[];
}

export function StatsCharts({ data }: StatsChartsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Distance chart */}
      <div className="chart-container card">
        <div className="chart-title">Dystans (km)</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155' }}
              labelStyle={{ color: '#f1f5f9' }}
            />
            <Line
              type="monotone"
              dataKey="distance"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 4 }}
              name="km"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Calories chart */}
      <div className="chart-container card">
        <div className="chart-title">Kalorie (kcal)</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155' }}
              labelStyle={{ color: '#f1f5f9' }}
            />
            <Bar dataKey="calories" fill="#f97316" radius={[4, 4, 0, 0]} name="kcal" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Steps chart */}
      <div className="chart-container card">
        <div className="chart-title">Kroki</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155' }}
              labelStyle={{ color: '#f1f5f9' }}
            />
            <Line
              type="monotone"
              dataKey="steps"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ fill: '#22c55e', r: 4 }}
              name="kroki"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Pace chart */}
      <div className="chart-container card">
        <div className="chart-title">Tempo (min/km)</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
            <YAxis stroke="#64748b" fontSize={12} reversed />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155' }}
              labelStyle={{ color: '#f1f5f9' }}
            />
            <Line
              type="monotone"
              dataKey="pace"
              stroke="#eab308"
              strokeWidth={2}
              dot={{ fill: '#eab308', r: 4 }}
              name="min/km"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function aggregateByDay(
  sessions: TreadmillSession[],
  from: string,
  to: string,
): Array<{ label: string; distance: number; calories: number; steps: number; pace: number }> {
  const map = new Map<
    string,
    { distance: number; calories: number; steps: number; duration: number }
  >();

  for (const s of sessions) {
    if (s.date < from || s.date > to) continue;
    const existing = map.get(s.date) ?? { distance: 0, calories: 0, steps: 0, duration: 0 };
    existing.distance += s.distanceKm;
    existing.calories += s.caloriesBurned;
    existing.steps += s.steps;
    existing.duration += s.durationSeconds;
    map.set(s.date, existing);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      label: date.slice(5),
      distance: Math.round(data.distance * 10) / 10,
      calories: data.calories,
      steps: data.steps,
      pace: data.distance > 0 ? Math.round((data.duration / 60 / data.distance) * 10) / 10 : 0,
    }));
}
