import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DataMode } from '@moze/shared';
import { fetchAppStatus, fetchChannelInfo, fetchDataModeStatus, fetchKpis, fetchTimeseries, probeDataMode, resumeSync, setDataMode, startSync } from '../lib/electron-api.ts';

export const DEFAULT_CHANNEL_ID = 'UC-SEED-PL-001';

export interface DateRange {
  dateFrom: string;
  dateTo: string;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildDateRange(days: number): DateRange {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return {
    dateFrom: toIsoDate(start),
    dateTo: toIsoDate(end),
  };
}

export function useAppStatusQuery() {
  return useQuery({
    queryKey: ['app', 'status'],
    queryFn: () => fetchAppStatus(),
    staleTime: 5_000,
  });
}

export function useDataModeStatusQuery(enabled: boolean) {
  return useQuery({
    queryKey: ['app', 'data-mode'],
    queryFn: () => fetchDataModeStatus(),
    enabled,
    staleTime: 5_000,
  });
}

export function useSetDataModeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: DataMode) => setDataMode({ mode }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['app', 'data-mode'] });
    },
  });
}

export function useProbeDataModeMutation() {
  return useMutation({
    mutationFn: (input: { channelId: string; videoIds: string[]; recentLimit: number }) =>
      probeDataMode(input),
  });
}

export function useStartSyncMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { channelId: string; profileId?: string | null; recentLimit: number }) =>
      startSync(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['app'] });
      void queryClient.invalidateQueries({ queryKey: ['db'] });
    },
  });
}

export function useResumeSyncMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { syncRunId: number; channelId: string; recentLimit: number }) =>
      resumeSync(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['app'] });
      void queryClient.invalidateQueries({ queryKey: ['db'] });
    },
  });
}

export function useChannelInfoQuery(channelId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['db', 'channel-info', channelId],
    queryFn: () => fetchChannelInfo({ channelId }),
    enabled,
    staleTime: 30_000,
  });
}

export function useKpisQuery(channelId: string, range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: ['db', 'kpis', channelId, range.dateFrom, range.dateTo],
    queryFn: () =>
      fetchKpis({
        channelId,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      }),
    enabled,
    staleTime: 30_000,
  });
}

export function useTimeseriesQuery(channelId: string, range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: ['db', 'timeseries', channelId, range.dateFrom, range.dateTo],
    queryFn: () =>
      fetchTimeseries({
        channelId,
        metric: 'views',
        granularity: 'day',
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
      }),
    enabled,
    staleTime: 30_000,
  });
}
