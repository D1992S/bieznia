import type Database from 'better-sqlite3';
import {
  AppError,
  ProfileSettingsDTOSchema,
  SettingsUpdateInputDTOSchema,
  err,
  ok,
  type ProfileSettingsDTO,
  type Result,
  type SettingsUpdateInputDTO,
} from '@moze/shared';

const PROFILE_SETTINGS_KEY = 'profile_settings';

interface AppMetaRow {
  value: string;
}

export interface SettingsQueries {
  getProfileSettings: () => Result<ProfileSettingsDTO, AppError>;
  updateProfileSettings: (patch: SettingsUpdateInputDTO['settings']) => Result<ProfileSettingsDTO, AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function readDefaultSettings(): ProfileSettingsDTO {
  return ProfileSettingsDTOSchema.parse({});
}

export function createSettingsQueries(db: Database.Database): SettingsQueries {
  const readAppMetaStmt = db.prepare<{ key: string }, AppMetaRow>(
    `
      SELECT value
      FROM app_meta
      WHERE key = @key
      ORDER BY key ASC
      LIMIT 1
    `,
  );

  const upsertAppMetaStmt = db.prepare<{ key: string; value: string; updatedAt: string }>(
    `
      INSERT INTO app_meta (key, value, updated_at)
      VALUES (@key, @value, @updatedAt)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
  );

  const readCurrentSettings = (): Result<ProfileSettingsDTO, AppError> => {
    try {
      const row = readAppMetaStmt.get({ key: PROFILE_SETTINGS_KEY });
      if (!row) {
        return ok(readDefaultSettings());
      }

      const parsedJson: unknown = JSON.parse(row.value);
      const parsedSettings = ProfileSettingsDTOSchema.safeParse(parsedJson);
      if (!parsedSettings.success) {
        return err(
          AppError.create(
            'DB_SETTINGS_INVALID',
            'Zapisane ustawienia profilu maja niepoprawny format.',
            'error',
            { issues: parsedSettings.error.issues },
          ),
        );
      }

      return ok(parsedSettings.data);
    } catch (cause) {
      return err(
        AppError.create(
          'DB_SETTINGS_READ_FAILED',
          'Nie udalo sie odczytac ustawien profilu.',
          'error',
          {},
          toError(cause),
        ),
      );
    }
  };

  return {
    getProfileSettings: () => readCurrentSettings(),
    updateProfileSettings: (patch) => {
      const parsedPatch = SettingsUpdateInputDTOSchema.safeParse({ settings: patch });
      if (!parsedPatch.success) {
        return err(
          AppError.create(
            'DB_SETTINGS_PATCH_INVALID',
            'Patch ustawien profilu ma niepoprawny format.',
            'error',
            { issues: parsedPatch.error.issues },
          ),
        );
      }

      const currentResult = readCurrentSettings();
      if (!currentResult.ok) {
        return currentResult;
      }

      const nextSettingsCandidate: unknown = {
        ...currentResult.value,
        ...parsedPatch.data.settings,
      };
      const parsedNextSettings = ProfileSettingsDTOSchema.safeParse(nextSettingsCandidate);
      if (!parsedNextSettings.success) {
        return err(
          AppError.create(
            'DB_SETTINGS_NEXT_INVALID',
            'Nowe ustawienia profilu sa niepoprawne.',
            'error',
            { issues: parsedNextSettings.error.issues },
          ),
        );
      }

      try {
        upsertAppMetaStmt.run({
          key: PROFILE_SETTINGS_KEY,
          value: JSON.stringify(parsedNextSettings.data),
          updatedAt: new Date().toISOString(),
        });
        return ok(parsedNextSettings.data);
      } catch (cause) {
        return err(
          AppError.create(
            'DB_SETTINGS_WRITE_FAILED',
            'Nie udalo sie zapisac ustawien profilu.',
            'error',
            {},
            toError(cause),
          ),
        );
      }
    },
  };
}
