import { describe, expect, it } from 'vitest';
import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  getAnomalyMethodLabel,
  getAnomalySeverityLabel,
  getChangePointDirectionLabel,
  getDiagnosticsActionLabel,
  getDiagnosticsHealthStatusLabel,
  getDiagnosticsRecoveryStatusLabel,
  getDiagnosticsStepStatusLabel,
  getPlanningConfidenceLabel,
  getQualityConfidenceLabel,
  getTopicConfidenceLabel,
  getTopicTrendDirectionLabel,
  getTrendDirectionLabel,
  getWeeklyStageLabel,
  mergeSeriesWithForecast,
} from './studio-app.tsx';

describe('studio-app UI helpers', () => {
  it('formats plain numbers in pl-PL style', () => {
    const formatted = formatNumber(1234);
    expect(formatted.replace(/\s+/g, '')).toBe('1234');
  });

  it('formats percent with two decimals', () => {
    expect(formatPercent(0.1234)).toBe('12.34%');
  });

  it('formats compact numbers for thousands and millions', () => {
    expect(formatCompactNumber(1200)).toContain('tys.');
    expect(formatCompactNumber(1_200_000)).toContain('mln');
  });

  it('maps trend directions to Polish labels', () => {
    expect(getTrendDirectionLabel('up')).toBe('wzrost');
    expect(getTrendDirectionLabel('down')).toBe('spadek');
    expect(getTrendDirectionLabel('flat')).toBe('brak zmiany');
  });

  it('maps change point direction labels', () => {
    expect(getChangePointDirectionLabel('up')).toBe('wzrost');
    expect(getChangePointDirectionLabel('down')).toBe('spadek');
  });

  it('maps anomaly severity and method labels', () => {
    expect(getAnomalySeverityLabel('critical')).toBe('krytyczna');
    expect(getAnomalySeverityLabel('high')).toBe('wysoka');
    expect(getAnomalyMethodLabel('consensus')).toBe('konsensus metod');
    expect(getAnomalyMethodLabel('zscore')).toBe('metoda z-score');
  });

  it('maps confidence labels consistently', () => {
    expect(getQualityConfidenceLabel('high')).toBe('wysoka');
    expect(getTopicConfidenceLabel('medium')).toBe('średnia');
    expect(getPlanningConfidenceLabel('low')).toBe('niska');
  });

  it('maps topic trend labels', () => {
    expect(getTopicTrendDirectionLabel('rising')).toBe('rosnący');
    expect(getTopicTrendDirectionLabel('stable')).toBe('stabilny');
    expect(getTopicTrendDirectionLabel('declining')).toBe('spadkowy');
  });

  it('maps diagnostics status labels', () => {
    expect(getDiagnosticsHealthStatusLabel('ok')).toBe('OK');
    expect(getDiagnosticsHealthStatusLabel('warning')).toBe('ostrzeżenie');
    expect(getDiagnosticsRecoveryStatusLabel('partial')).toBe('częściowo wykonano');
    expect(getDiagnosticsStepStatusLabel('skipped')).toBe('pominięto');
  });

  it('maps diagnostics action labels', () => {
    expect(getDiagnosticsActionLabel('integrity_check')).toBe('Kontrola integralności');
    expect(getDiagnosticsActionLabel('rerun_data_pipeline')).toBe('Ponowne przeliczenie pipeline');
  });

  it('maps weekly package stage labels', () => {
    expect(getWeeklyStageLabel('idle')).toBe('Gotowe do uruchomienia');
    expect(getWeeklyStageLabel('report')).toBe('Odświeżanie i eksport raportu');
    expect(getWeeklyStageLabel('failed')).toBe('Przebieg przerwany błędem');
  });

  it('merges actual and forecast series sorted by date', () => {
    const merged = mergeSeriesWithForecast(
      [
        { date: '2026-02-02', value: 20 },
        { date: '2026-02-01', value: 10 },
      ],
      [
        { date: '2026-02-03', horizonDays: 1, predicted: 30, p10: 25, p50: 30, p90: 35 },
      ],
    );

    expect(merged.map((item) => item.date)).toEqual(['2026-02-01', '2026-02-02', '2026-02-03']);
    expect(merged[0]?.actual).toBe(10);
    expect(merged[2]?.p50).toBe(30);
  });

  it('overlays forecast values on existing actual date rows', () => {
    const merged = mergeSeriesWithForecast(
      [{ date: '2026-02-01', value: 10 }],
      [{ date: '2026-02-01', horizonDays: 1, predicted: 12, p10: 8, p50: 12, p90: 15 }],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.actual).toBe(10);
    expect(merged[0]?.p10).toBe(8);
    expect(merged[0]?.p90).toBe(15);
  });
});
