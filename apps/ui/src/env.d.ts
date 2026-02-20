/// <reference types="vite/client" />

import type { ElectronAPI } from './lib/electron-api.types.ts';

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
