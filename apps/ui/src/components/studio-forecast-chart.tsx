import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface StudioChartPoint {
  date: string;
  actual: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
}

interface StudioForecastChartProps {
  points: StudioChartPoint[];
  metricLabel: string;
}

const THEME = {
  border: '#2a2f37',
  panelElevated: '#1f232b',
  text: '#f8fafc',
  title: '#b4bac3',
  muted: '#8c949f',
  accent: '#96c5ff',
  forecast: '#cfadff',
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pl-PL').format(Math.round(value));
}

function formatDateTick(dateIso: string): string {
  const parsed = new Date(`${dateIso}T00:00:00`);
  return parsed.toLocaleDateString('pl-PL', { day: '2-digit', month: 'short' });
}

function formatDateTooltip(dateIso: string): string {
  const parsed = new Date(`${dateIso}T00:00:00`);
  return parsed.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatAxisValue(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace('.', ',')} mln`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)} tys.`;
  }
  return formatNumber(value);
}

export function StudioForecastChart(props: StudioForecastChartProps) {
  const values = props.points
    .flatMap((point) => [point.actual, point.p10, point.p50, point.p90])
    .filter((value): value is number => value !== null);

  if (props.points.length === 0 || values.length === 0) {
    return <p style={{ color: THEME.muted }}>Brak danych wykresu dla wybranego zakresu.</p>;
  }

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const minValue = Math.max(0, Math.floor(minimum * 0.9));
  const maxValue = Math.ceil(maximum === minimum ? maximum + 1 : maximum * 1.1);
  const timelineMarkers = props.points
    .filter((point) => point.actual !== null)
    .filter((_point, index, all) => {
      const divider = Math.max(1, Math.floor(all.length / 5));
      return index % divider === 0;
    });
  const markerY = minValue + (maxValue - minValue) * 0.03;

  return (
    <div
      style={{
        border: `1px solid ${THEME.border}`,
        borderRadius: 16,
        background: THEME.panelElevated,
        padding: 14,
      }}
    >
      <div style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={props.points}
            margin={{ top: 10, right: 24, left: 8, bottom: 26 }}
            aria-label={`Wykres ${props.metricLabel} z prognozą`}
          >
            <CartesianGrid stroke="#293142" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              axisLine={{ stroke: '#374152' }}
              tickLine={{ stroke: '#374152' }}
              tick={{ fill: THEME.muted, fontSize: 12 }}
              tickFormatter={formatDateTick}
              minTickGap={26}
            />
            <YAxis
              orientation="right"
              domain={[minValue, maxValue]}
              axisLine={{ stroke: '#374152' }}
              tickLine={{ stroke: '#374152' }}
              tick={{ fill: THEME.muted, fontSize: 12 }}
              tickFormatter={formatAxisValue}
              width={70}
            />
            <Tooltip
              cursor={{ stroke: '#42506a', strokeWidth: 1 }}
              contentStyle={{
                backgroundColor: '#13171f',
                border: '1px solid #2b3344',
                borderRadius: 10,
                color: THEME.text,
              }}
              labelStyle={{ color: THEME.title }}
              formatter={(rawValue: number | string | undefined, name: string | undefined) => {
                const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue ?? 0);
                const label = name === 'actual' ? 'Rzeczywiste' : name === 'p50' ? 'Prognoza p50' : name;
                return [new Intl.NumberFormat('pl-PL').format(numericValue), label];
              }}
              labelFormatter={(label) => formatDateTooltip(String(label))}
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke={THEME.accent}
              strokeWidth={2}
              dot={false}
              connectNulls
              activeDot={{ r: 4, fill: '#0f141f', stroke: THEME.accent, strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="p50"
              stroke={THEME.forecast}
              strokeWidth={2}
              dot={false}
              strokeDasharray="6 4"
              connectNulls
            />
            <Line type="monotone" dataKey="p10" stroke="rgba(207, 173, 255, 0.4)" strokeWidth={1.2} dot={false} connectNulls />
            <Line type="monotone" dataKey="p90" stroke="rgba(207, 173, 255, 0.4)" strokeWidth={1.2} dot={false} connectNulls />
            {timelineMarkers.map((point) => (
              <ReferenceDot
                key={`marker-${point.date}`}
                x={point.date}
                y={markerY}
                ifOverflow="extendDomain"
                shape={
                  <g>
                    <rect x={-7} y={-5} width={14} height={10} rx={3} ry={3} fill="#323848" stroke="#5d677d" strokeWidth={1} />
                    <polygon points="-2.2,-2.6 -2.2,2.6 2.6,0" fill="#dbe7ff" />
                  </g>
                }
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p style={{ marginTop: 10, marginBottom: 0, color: THEME.muted, fontSize: 13 }}>
        Linia jasnoniebieska: dane rzeczywiste, linia fioletowa: prognoza p50, linie pomocnicze: p10 i p90.
      </p>
    </div>
  );
}
