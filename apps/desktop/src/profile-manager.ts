import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  AppError,
  AuthStatusDTOSchema,
  ProfileCreateInputDTOSchema,
  ProfileListResultDTOSchema,
  ProfileSetActiveInputDTOSchema,
  ProfileSummaryDTOSchema,
  err,
  ok,
  type AuthConnectInputDTO,
  type AuthStatusDTO,
  type ProfileListResultDTO,
  type ProfileSummaryDTO,
  type Result,
} from '@moze/shared';
import { z } from 'zod/v4';

interface ProfileRegistryEntry {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface ProfileRegistry {
  version: 1;
  activeProfileId: string;
  profiles: ProfileRegistryEntry[];
}

interface AuthMetadata {
  provider: 'youtube';
  accountLabel: string;
  connectedAt: string;
}

const PROFILE_REGISTRY_SCHEMA = z.object({
  version: z.literal(1),
  activeProfileId: z.string().min(1),
  profiles: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
    }),
  ).min(1),
});

const AUTH_METADATA_SCHEMA = z.object({
  provider: z.literal('youtube'),
  accountLabel: z.string().min(1),
  connectedAt: z.iso.datetime(),
});

export interface SecretCryptoAdapter {
  isAvailable: () => boolean;
  encryptString: (plainText: string) => Buffer;
  decryptString: (cipherText: Buffer) => string;
}

export interface CreateProfileManagerInput {
  rootDir: string;
  crypto: SecretCryptoAdapter;
  now?: () => Date;
}

export interface ProfileManager {
  listProfiles: () => Result<ProfileListResultDTO, AppError>;
  createProfile: (input: { name: string; setActive?: boolean }) => Result<ProfileListResultDTO, AppError>;
  setActiveProfile: (input: { profileId: string }) => Result<ProfileListResultDTO, AppError>;
  getActiveProfile: () => Result<ProfileSummaryDTO, AppError>;
  getActiveDbPath: () => Result<string, AppError>;
  getAuthStatus: () => Result<AuthStatusDTO, AppError>;
  connectAuth: (input: AuthConnectInputDTO) => Result<AuthStatusDTO, AppError>;
  disconnectAuth: () => Result<AuthStatusDTO, AppError>;
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  return new Error(String(cause));
}

function slugifyName(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

function createProfileId(name: string, now: Date): string {
  const slug = slugifyName(name);
  const timePart = now.toISOString().replaceAll(':', '').replaceAll('-', '').replaceAll('.', '');
  const randomPart = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  return `PROFILE-${slug || 'USER'}-${timePart}-${randomPart}`;
}

function createDefaultRegistry(nowIso: string): ProfileRegistry {
  return {
    version: 1,
    activeProfileId: 'PROFILE-DEFAULT',
    profiles: [
      {
        id: 'PROFILE-DEFAULT',
        name: 'Profil domyslny',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ],
  };
}

function createProfileNotFoundError(profileId: string): AppError {
  return AppError.create(
    'PROFILE_NOT_FOUND',
    'Nie znaleziono profilu o podanym identyfikatorze.',
    'error',
    { profileId },
  );
}

export function createProfileManager(input: CreateProfileManagerInput): Result<ProfileManager, AppError> {
  const now = input.now ?? (() => new Date());
  const registryPath = path.join(input.rootDir, 'profiles-registry.json');
  const profilesDir = path.join(input.rootDir, 'profiles');

  const ensureDirectories = (): Result<void, AppError> => {
    try {
      fs.mkdirSync(profilesDir, { recursive: true });
      return ok(undefined);
    } catch (cause) {
      return err(
        AppError.create(
          'PROFILE_DIR_CREATE_FAILED',
          'Nie udalo sie przygotowac katalogu profili.',
          'error',
          { profilesDir },
          toError(cause),
        ),
      );
    }
  };

  const readRegistry = (): Result<ProfileRegistry, AppError> => {
    try {
      if (!fs.existsSync(registryPath)) {
        const defaultRegistry = createDefaultRegistry(now().toISOString());
        const writeResult = writeRegistry(defaultRegistry);
        if (!writeResult.ok) {
          return writeResult;
        }
        return ok(defaultRegistry);
      }

      const raw = fs.readFileSync(registryPath, 'utf8');
      const parsedJson: unknown = JSON.parse(raw);
      const parsedRegistry = PROFILE_REGISTRY_SCHEMA.safeParse(parsedJson);
      if (!parsedRegistry.success) {
        return err(
          AppError.create(
            'PROFILE_REGISTRY_INVALID',
            'Rejestr profili ma niepoprawny format.',
            'error',
            { issues: parsedRegistry.error.issues },
          ),
        );
      }

      return ok(parsedRegistry.data);
    } catch (cause) {
      return err(
        AppError.create(
          'PROFILE_REGISTRY_READ_FAILED',
          'Nie udalo sie odczytac rejestru profili.',
          'error',
          { registryPath },
          toError(cause),
        ),
      );
    }
  };

  const writeRegistry = (registry: ProfileRegistry): Result<void, AppError> => {
    try {
      fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
      return ok(undefined);
    } catch (cause) {
      return err(
        AppError.create(
          'PROFILE_REGISTRY_WRITE_FAILED',
          'Nie udalo sie zapisac rejestru profili.',
          'error',
          { registryPath },
          toError(cause),
        ),
      );
    }
  };

  const getProfileDir = (profileId: string): string => path.join(profilesDir, profileId);
  const getDbPath = (profileId: string): string => path.join(getProfileDir(profileId), 'mozetobedzieto.sqlite');
  const getAuthSecretPath = (profileId: string): string => path.join(getProfileDir(profileId), 'auth-secret.bin');
  const getAuthMetaPath = (profileId: string): string => path.join(getProfileDir(profileId), 'auth-meta.json');

  const ensureProfileDir = (profileId: string): Result<void, AppError> => {
    try {
      fs.mkdirSync(getProfileDir(profileId), { recursive: true });
      return ok(undefined);
    } catch (cause) {
      return err(
        AppError.create(
          'PROFILE_DIR_PREPARE_FAILED',
          'Nie udalo sie przygotowac katalogu profilu.',
          'error',
          { profileId },
          toError(cause),
        ),
      );
    }
  };

  const buildListResult = (registry: ProfileRegistry): Result<ProfileListResultDTO, AppError> => {
    const mappedProfiles: ProfileSummaryDTO[] = registry.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      isActive: profile.id === registry.activeProfileId,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    }));

    const parsed = ProfileListResultDTOSchema.safeParse({
      activeProfileId: registry.activeProfileId,
      profiles: mappedProfiles,
    });
    if (!parsed.success) {
      return err(
        AppError.create(
          'PROFILE_LIST_OUTPUT_INVALID',
          'Lista profili ma niepoprawny format.',
          'error',
          { issues: parsed.error.issues },
        ),
      );
    }
    return ok(parsed.data);
  };

  const readAuthMeta = (profileId: string): Result<AuthMetadata | null, AppError> => {
    const metaPath = getAuthMetaPath(profileId);
    if (!fs.existsSync(metaPath)) {
      return ok(null);
    }

    try {
      const raw = fs.readFileSync(metaPath, 'utf8');
      const parsedJson: unknown = JSON.parse(raw);
      const parsed = AUTH_METADATA_SCHEMA.safeParse(parsedJson);
      if (!parsed.success) {
        return err(
          AppError.create(
            'AUTH_META_INVALID',
            'Metadane auth maja niepoprawny format.',
            'error',
            { profileId, issues: parsed.error.issues },
          ),
        );
      }
      return ok(parsed.data);
    } catch (cause) {
      return err(
        AppError.create(
          'AUTH_META_READ_FAILED',
          'Nie udalo sie odczytac metadanych auth.',
          'error',
          { profileId },
          toError(cause),
        ),
      );
    }
  };

  const writeAuthMeta = (profileId: string, meta: AuthMetadata): Result<void, AppError> => {
    try {
      fs.writeFileSync(getAuthMetaPath(profileId), JSON.stringify(meta, null, 2), 'utf8');
      return ok(undefined);
    } catch (cause) {
      return err(
        AppError.create(
          'AUTH_META_WRITE_FAILED',
          'Nie udalo sie zapisac metadanych auth.',
          'error',
          { profileId },
          toError(cause),
        ),
      );
    }
  };

  const buildDisconnectedAuthStatus = (): AuthStatusDTO => ({
    connected: false,
    provider: null,
    accountLabel: null,
    connectedAt: null,
    storage: 'safeStorage',
  });

  const ensureReadyResult = ensureDirectories();
  if (!ensureReadyResult.ok) {
    return ensureReadyResult;
  }

  return ok({
    listProfiles: () => {
      const registryResult = readRegistry();
      if (!registryResult.ok) {
        return registryResult;
      }
      return buildListResult(registryResult.value);
    },
    createProfile: (createInput) => {
      const parsedInput = ProfileCreateInputDTOSchema.safeParse(createInput);
      if (!parsedInput.success) {
        return err(
          AppError.create(
            'PROFILE_CREATE_INPUT_INVALID',
            'Dane nowego profilu sa niepoprawne.',
            'error',
            { issues: parsedInput.error.issues },
          ),
        );
      }

      const registryResult = readRegistry();
      if (!registryResult.ok) {
        return registryResult;
      }

      const registry = registryResult.value;
      const timestamp = now().toISOString();
      const profileId = createProfileId(parsedInput.data.name, new Date(timestamp));
      registry.profiles.push({
        id: profileId,
        name: parsedInput.data.name,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      if (parsedInput.data.setActive) {
        registry.activeProfileId = profileId;
      }

      const ensureDirResult = ensureProfileDir(profileId);
      if (!ensureDirResult.ok) {
        return ensureDirResult;
      }

      const writeResult = writeRegistry(registry);
      if (!writeResult.ok) {
        return writeResult;
      }

      return buildListResult(registry);
    },
    setActiveProfile: (setActiveInput) => {
      const parsedInput = ProfileSetActiveInputDTOSchema.safeParse(setActiveInput);
      if (!parsedInput.success) {
        return err(
          AppError.create(
            'PROFILE_SET_ACTIVE_INPUT_INVALID',
            'Dane aktywnego profilu sa niepoprawne.',
            'error',
            { issues: parsedInput.error.issues },
          ),
        );
      }

      const registryResult = readRegistry();
      if (!registryResult.ok) {
        return registryResult;
      }

      const registry = registryResult.value;
      const profile = registry.profiles.find((entry) => entry.id === parsedInput.data.profileId);
      if (!profile) {
        return err(createProfileNotFoundError(parsedInput.data.profileId));
      }

      profile.updatedAt = now().toISOString();
      registry.activeProfileId = parsedInput.data.profileId;

      const ensureDirResult = ensureProfileDir(parsedInput.data.profileId);
      if (!ensureDirResult.ok) {
        return ensureDirResult;
      }

      const writeResult = writeRegistry(registry);
      if (!writeResult.ok) {
        return writeResult;
      }

      return buildListResult(registry);
    },
    getActiveProfile: () => {
      const registryResult = readRegistry();
      if (!registryResult.ok) {
        return registryResult;
      }

      const profile = registryResult.value.profiles.find((entry) => entry.id === registryResult.value.activeProfileId);
      if (!profile) {
        return err(createProfileNotFoundError(registryResult.value.activeProfileId));
      }

      const parsed = ProfileSummaryDTOSchema.safeParse({
        id: profile.id,
        name: profile.name,
        isActive: true,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      });
      if (!parsed.success) {
        return err(
          AppError.create(
            'PROFILE_ACTIVE_INVALID',
            'Aktywny profil ma niepoprawny format.',
            'error',
            { issues: parsed.error.issues },
          ),
        );
      }

      return ok(parsed.data);
    },
    getActiveDbPath: () => {
      const activeProfileResult = readRegistry();
      if (!activeProfileResult.ok) {
        return activeProfileResult;
      }
      const activeProfileId = activeProfileResult.value.activeProfileId;
      const ensureDirResult = ensureProfileDir(activeProfileId);
      if (!ensureDirResult.ok) {
        return ensureDirResult;
      }
      return ok(getDbPath(activeProfileId));
    },
    getAuthStatus: () => {
      const activeProfileResult = readRegistry();
      if (!activeProfileResult.ok) {
        return activeProfileResult;
      }
      const profileId = activeProfileResult.value.activeProfileId;
      const secretPath = getAuthSecretPath(profileId);

      if (!fs.existsSync(secretPath)) {
        return ok(buildDisconnectedAuthStatus());
      }

      const authMetaResult = readAuthMeta(profileId);
      if (!authMetaResult.ok) {
        return authMetaResult;
      }
      const authMeta = authMetaResult.value;
      if (!authMeta) {
        return ok(buildDisconnectedAuthStatus());
      }

      const parsedStatus = AuthStatusDTOSchema.safeParse({
        connected: true,
        provider: authMeta.provider,
        accountLabel: authMeta.accountLabel,
        connectedAt: authMeta.connectedAt,
        storage: 'safeStorage',
      });
      if (!parsedStatus.success) {
        return err(
          AppError.create(
            'AUTH_STATUS_INVALID',
            'Status auth ma niepoprawny format.',
            'error',
            { issues: parsedStatus.error.issues },
          ),
        );
      }

      return ok(parsedStatus.data);
    },
    connectAuth: (connectInput) => {
      if (!input.crypto.isAvailable()) {
        return err(
          AppError.create(
            'AUTH_SAFE_STORAGE_UNAVAILABLE',
            'Szyfrowanie bezpiecznego storage jest niedostepne w tym systemie.',
            'error',
            {},
          ),
        );
      }

      const activeProfileResult = readRegistry();
      if (!activeProfileResult.ok) {
        return activeProfileResult;
      }
      const profileId = activeProfileResult.value.activeProfileId;

      const ensureDirResult = ensureProfileDir(profileId);
      if (!ensureDirResult.ok) {
        return ensureDirResult;
      }

      try {
        const payload = JSON.stringify({
          provider: connectInput.provider,
          accountLabel: connectInput.accountLabel,
          accessToken: connectInput.accessToken,
          refreshToken: connectInput.refreshToken ?? null,
        });
        const encrypted = input.crypto.encryptString(payload);
        fs.writeFileSync(getAuthSecretPath(profileId), encrypted);
      } catch (cause) {
        return err(
          AppError.create(
            'AUTH_SECRET_WRITE_FAILED',
            'Nie udalo sie zapisac zaszyfrowanych danych auth.',
            'error',
            { profileId },
            toError(cause),
          ),
        );
      }

      const meta: AuthMetadata = {
        provider: 'youtube',
        accountLabel: connectInput.accountLabel,
        connectedAt: now().toISOString(),
      };
      const writeMetaResult = writeAuthMeta(profileId, meta);
      if (!writeMetaResult.ok) {
        return writeMetaResult;
      }

      return ok({
        connected: true,
        provider: meta.provider,
        accountLabel: meta.accountLabel,
        connectedAt: meta.connectedAt,
        storage: 'safeStorage',
      });
    },
    disconnectAuth: () => {
      const activeProfileResult = readRegistry();
      if (!activeProfileResult.ok) {
        return activeProfileResult;
      }
      const profileId = activeProfileResult.value.activeProfileId;
      const secretPath = getAuthSecretPath(profileId);
      const metaPath = getAuthMetaPath(profileId);

      try {
        if (fs.existsSync(secretPath)) {
          fs.rmSync(secretPath, { force: true });
        }
        if (fs.existsSync(metaPath)) {
          fs.rmSync(metaPath, { force: true });
        }
      } catch (cause) {
        return err(
          AppError.create(
            'AUTH_DISCONNECT_FAILED',
            'Nie udalo sie usunac danych auth.',
            'error',
            { profileId },
            toError(cause),
          ),
        );
      }

      return ok(buildDisconnectedAuthStatus());
    },
  });
}
