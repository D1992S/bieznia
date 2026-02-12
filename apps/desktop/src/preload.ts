import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  invoke: (channel: string, data?: unknown) => Promise<unknown>;
  on: (channel: string, callback: (data: unknown) => void) => () => void;
}

const api: ElectronAPI = {
  invoke: (channel: string, data?: unknown): Promise<unknown> => {
    const ALLOWED_CHANNELS = [
      'app:getStatus',
      'db:getKpis',
      'db:getTimeseries',
      'db:getChannelInfo',
    ];

    if (!ALLOWED_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`Kanał IPC niedozwolony: ${channel}`));
    }

    return ipcRenderer.invoke(channel, data);
  },

  on: (channel: string, callback: (data: unknown) => void): (() => void) => {
    const ALLOWED_EVENTS = [
      'sync:progress',
      'sync:complete',
      'sync:error',
    ];

    if (!ALLOWED_EVENTS.includes(channel)) {
      throw new Error(`Kanał zdarzeń IPC niedozwolony: ${channel}`);
    }

    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => {
      callback(data);
    };

    ipcRenderer.on(channel, handler);

    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
