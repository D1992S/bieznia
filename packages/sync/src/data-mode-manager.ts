import {
  AppError,
  DataModeProbeInputDTOSchema,
  DataModeProbeResultDTOSchema,
  DataModeSchema,
  SetDataModeInputDTOSchema,
  err,
  ok,
  type DataMode,
  type DataModeProbeInputDTO,
  type DataModeProbeResultDTO,
  type DataModeStatusDTO,
  type Result,
  type SetDataModeInputDTO,
} from '@moze/shared';
import type { DataProvider } from './data-provider.ts';
import type { RecordingDataProvider } from './record-provider.ts';

export interface CreateDataModeManagerInput {
  initialMode?: DataMode;
  fakeProvider: DataProvider;
  realProvider: DataProvider;
  recordProvider: RecordingDataProvider;
  source?: string;
}

export interface ActiveDataProvider {
  mode: DataMode;
  provider: DataProvider;
}

export interface DataModeManager {
  getStatus: () => DataModeStatusDTO;
  getActiveProvider: () => ActiveDataProvider;
  setMode: (input: SetDataModeInputDTO) => Result<DataModeStatusDTO, AppError>;
  probe: (input: DataModeProbeInputDTO) => Result<DataModeProbeResultDTO, AppError>;
}

const AVAILABLE_MODES: DataMode[] = ['fake', 'real', 'record'];

function createValidationError(code: string, issues: unknown): AppError {
  return AppError.create(
    code,
    'Przekazano niepoprawne dane trybu danych.',
    'error',
    { issues },
  );
}

function pickProvider(mode: DataMode, input: CreateDataModeManagerInput): DataProvider {
  switch (mode) {
    case 'fake':
      return input.fakeProvider;
    case 'real':
      return input.realProvider;
    case 'record':
      return input.recordProvider;
  }
}

export function createDataModeManager(input: CreateDataModeManagerInput): DataModeManager {
  const parsedMode = DataModeSchema.safeParse(input.initialMode ?? 'fake');
  let currentMode: DataMode = parsedMode.success ? parsedMode.data : 'fake';
  const source = input.source ?? 'desktop-runtime';

  const getStatus = (): DataModeStatusDTO => ({
    mode: currentMode,
    availableModes: AVAILABLE_MODES,
    source,
  });

  const getActiveProvider = (): ActiveDataProvider => ({
    mode: currentMode,
    provider: pickProvider(currentMode, input),
  });

  return {
    getStatus,
    getActiveProvider,
    setMode: (setModeInput) => {
      const parsedInput = SetDataModeInputDTOSchema.safeParse(setModeInput);
      if (!parsedInput.success) {
        return err(createValidationError('SYNC_MODE_SET_INVALID', parsedInput.error.issues));
      }

      currentMode = parsedInput.data.mode;
      return ok(getStatus());
    },
    probe: (probeInput) => {
      const parsedProbe = DataModeProbeInputDTOSchema.safeParse(probeInput);
      if (!parsedProbe.success) {
        return err(createValidationError('SYNC_MODE_PROBE_INVALID', parsedProbe.error.issues));
      }

      const provider = getActiveProvider().provider;
      const channelResult = provider.getChannelStats({ channelId: parsedProbe.data.channelId });
      if (!channelResult.ok) {
        return channelResult;
      }

      const recentResult = provider.getRecentVideos({
        channelId: parsedProbe.data.channelId,
        limit: parsedProbe.data.recentLimit,
      });
      if (!recentResult.ok) {
        return recentResult;
      }

      const videoStatsResult = provider.getVideoStats({ videoIds: parsedProbe.data.videoIds });
      if (!videoStatsResult.ok) {
        return videoStatsResult;
      }

      const resultPayload: DataModeProbeResultDTO = {
        mode: currentMode,
        providerName: provider.name,
        channelId: channelResult.value.channelId,
        recentVideos: recentResult.value.length,
        videoStats: videoStatsResult.value.length,
        recordFilePath: currentMode === 'record' ? input.recordProvider.getLastRecordPath() : null,
      };

      const parsedOutput = DataModeProbeResultDTOSchema.safeParse(resultPayload);
      if (!parsedOutput.success) {
        return err(
          AppError.create(
            'SYNC_MODE_PROBE_OUTPUT_INVALID',
            'Wynik probe mode ma niepoprawny format.',
            'error',
            { issues: parsedOutput.error.issues },
          ),
        );
      }

      return ok(parsedOutput.data);
    },
  };
}
