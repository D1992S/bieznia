import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createDatabaseConnection,
  createSettingsQueries,
  runMigrations,
} from '@moze/core';
import { describe, expect, it } from 'vitest';
import { createProfileManager, type SecretCryptoAdapter } from './profile-manager.ts';

function createFakeCryptoAdapter(): SecretCryptoAdapter {
  return {
    isAvailable: () => true,
    encryptString: (plainText) => {
      const base64 = Buffer.from(plainText, 'utf8').toString('base64');
      return Buffer.from(base64, 'utf8');
    },
    decryptString: (cipherText) => {
      const base64 = cipherText.toString('utf8');
      return Buffer.from(base64, 'base64').toString('utf8');
    },
  };
}

function createTempRootDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'moze-profile-manager-'));
}

function cleanupTempRootDir(rootDir: string): void {
  fs.rmSync(rootDir, { recursive: true, force: true });
}

function openProfileSettingsDb(dbPath: string) {
  const connectionResult = createDatabaseConnection({ filename: dbPath });
  expect(connectionResult.ok).toBe(true);
  if (!connectionResult.ok) {
    throw new Error(connectionResult.error.message);
  }

  const migrationResult = runMigrations(connectionResult.value.db);
  expect(migrationResult.ok).toBe(true);
  if (!migrationResult.ok) {
    throw new Error(migrationResult.error.message);
  }

  return {
    connection: connectionResult.value,
    settingsQueries: createSettingsQueries(connectionResult.value.db),
  };
}

describe('profile-manager integration', () => {
  it('keeps profile-specific settings isolated after restart', () => {
    const rootDir = createTempRootDir();

    try {
      const managerResult = createProfileManager({
        rootDir,
        crypto: createFakeCryptoAdapter(),
      });
      expect(managerResult.ok).toBe(true);
      if (!managerResult.ok) {
        return;
      }

      const manager = managerResult.value;

      const initialProfilesResult = manager.listProfiles();
      expect(initialProfilesResult.ok).toBe(true);
      if (!initialProfilesResult.ok) {
        return;
      }

      const defaultProfileId = initialProfilesResult.value.activeProfileId;
      expect(defaultProfileId).not.toBeNull();
      if (!defaultProfileId) {
        return;
      }

      const defaultDbPathResult = manager.getActiveDbPath();
      expect(defaultDbPathResult.ok).toBe(true);
      if (!defaultDbPathResult.ok) {
        return;
      }

      const defaultDb = openProfileSettingsDb(defaultDbPathResult.value);
      const defaultSettingsUpdate = defaultDb.settingsQueries.updateProfileSettings({
        defaultDatePreset: '7d',
        autoRunSync: true,
      });
      expect(defaultSettingsUpdate.ok).toBe(true);
      const defaultCloseResult = defaultDb.connection.close();
      expect(defaultCloseResult.ok).toBe(true);

      const createdProfileResult = manager.createProfile({
        name: 'Profil drugi',
        setActive: true,
      });
      expect(createdProfileResult.ok).toBe(true);
      if (!createdProfileResult.ok) {
        return;
      }

      const secondProfileId = createdProfileResult.value.activeProfileId;
      expect(secondProfileId).not.toBe(defaultProfileId);
      if (!secondProfileId) {
        return;
      }

      const secondDbPathResult = manager.getActiveDbPath();
      expect(secondDbPathResult.ok).toBe(true);
      if (!secondDbPathResult.ok) {
        return;
      }

      const secondDb = openProfileSettingsDb(secondDbPathResult.value);
      const secondSettingsUpdate = secondDb.settingsQueries.updateProfileSettings({
        defaultDatePreset: '90d',
        autoRunSync: false,
      });
      expect(secondSettingsUpdate.ok).toBe(true);
      const secondCloseResult = secondDb.connection.close();
      expect(secondCloseResult.ok).toBe(true);

      const restartedManagerResult = createProfileManager({
        rootDir,
        crypto: createFakeCryptoAdapter(),
      });
      expect(restartedManagerResult.ok).toBe(true);
      if (!restartedManagerResult.ok) {
        return;
      }

      const restartedManager = restartedManagerResult.value;

      const setDefaultActiveResult = restartedManager.setActiveProfile({ profileId: defaultProfileId });
      expect(setDefaultActiveResult.ok).toBe(true);
      const restartedDefaultDbPathResult = restartedManager.getActiveDbPath();
      expect(restartedDefaultDbPathResult.ok).toBe(true);
      if (!restartedDefaultDbPathResult.ok) {
        return;
      }

      const restartedDefaultDb = openProfileSettingsDb(restartedDefaultDbPathResult.value);
      const restartedDefaultSettings = restartedDefaultDb.settingsQueries.getProfileSettings();
      expect(restartedDefaultSettings.ok).toBe(true);
      if (restartedDefaultSettings.ok) {
        expect(restartedDefaultSettings.value.defaultDatePreset).toBe('7d');
        expect(restartedDefaultSettings.value.autoRunSync).toBe(true);
      }
      const restartedDefaultCloseResult = restartedDefaultDb.connection.close();
      expect(restartedDefaultCloseResult.ok).toBe(true);

      const setSecondActiveResult = restartedManager.setActiveProfile({ profileId: secondProfileId });
      expect(setSecondActiveResult.ok).toBe(true);
      const restartedSecondDbPathResult = restartedManager.getActiveDbPath();
      expect(restartedSecondDbPathResult.ok).toBe(true);
      if (!restartedSecondDbPathResult.ok) {
        return;
      }

      const restartedSecondDb = openProfileSettingsDb(restartedSecondDbPathResult.value);
      const restartedSecondSettings = restartedSecondDb.settingsQueries.getProfileSettings();
      expect(restartedSecondSettings.ok).toBe(true);
      if (restartedSecondSettings.ok) {
        expect(restartedSecondSettings.value.defaultDatePreset).toBe('90d');
        expect(restartedSecondSettings.value.autoRunSync).toBe(false);
      }
      const restartedSecondCloseResult = restartedSecondDb.connection.close();
      expect(restartedSecondCloseResult.ok).toBe(true);
    } finally {
      cleanupTempRootDir(rootDir);
    }
  });

  it('stores auth secret in encrypted blob and persists status', () => {
    const rootDir = createTempRootDir();

    try {
      const managerResult = createProfileManager({
        rootDir,
        crypto: createFakeCryptoAdapter(),
      });
      expect(managerResult.ok).toBe(true);
      if (!managerResult.ok) {
        return;
      }

      const manager = managerResult.value;

      const connectResult = manager.connectAuth({
        provider: 'youtube',
        accountLabel: 'Konto testowe',
        accessToken: 'very-secret-access-token',
        refreshToken: 'very-secret-refresh-token',
      });
      expect(connectResult.ok).toBe(true);

      const statusResult = manager.getAuthStatus();
      expect(statusResult.ok).toBe(true);
      if (statusResult.ok) {
        expect(statusResult.value.connected).toBe(true);
        expect(statusResult.value.provider).toBe('youtube');
      }

      const activeProfileResult = manager.getActiveProfile();
      expect(activeProfileResult.ok).toBe(true);
      if (!activeProfileResult.ok) {
        return;
      }

      const secretPath = path.join(rootDir, 'profiles', activeProfileResult.value.id, 'auth-secret.bin');
      expect(fs.existsSync(secretPath)).toBe(true);
      const rawSecret = fs.readFileSync(secretPath, 'utf8');
      expect(rawSecret.includes('very-secret-access-token')).toBe(false);
      expect(rawSecret.includes('very-secret-refresh-token')).toBe(false);

      const restartedManagerResult = createProfileManager({
        rootDir,
        crypto: createFakeCryptoAdapter(),
      });
      expect(restartedManagerResult.ok).toBe(true);
      if (!restartedManagerResult.ok) {
        return;
      }

      const restartedStatusResult = restartedManagerResult.value.getAuthStatus();
      expect(restartedStatusResult.ok).toBe(true);
      if (restartedStatusResult.ok) {
        expect(restartedStatusResult.value.connected).toBe(true);
        expect(restartedStatusResult.value.accountLabel).toBe('Konto testowe');
      }

      const disconnectResult = restartedManagerResult.value.disconnectAuth();
      expect(disconnectResult.ok).toBe(true);
      if (disconnectResult.ok) {
        expect(disconnectResult.value.connected).toBe(false);
      }
    } finally {
      cleanupTempRootDir(rootDir);
    }
  });
});
