import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '@moze/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('IPC contract parity', () => {
  it('maps every shared IPC channel in desktop handlers and preload bridge', () => {
    const handlerSource = readRepoFile('apps/desktop/src/ipc-handlers.ts');
    const preloadSource = readRepoFile('apps/desktop/src/preload.ts');

    const channelKeys = Object.keys(IPC_CHANNELS) as Array<keyof typeof IPC_CHANNELS>;

    const missingInHandlers = channelKeys.filter((key) => !handlerSource.includes(`IPC_CHANNELS.${key}`));
    const missingInPreload = channelKeys.filter((key) => !preloadSource.includes(`IPC_CHANNELS.${key}`));

    expect(missingInHandlers).toEqual([]);
    expect(missingInPreload).toEqual([]);
  });
});
