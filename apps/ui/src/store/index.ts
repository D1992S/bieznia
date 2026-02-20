import { create } from 'zustand';

interface AppState {
  initialized: boolean;
  sidebarOpen: boolean;
  setInitialized: (value: boolean) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>()((set) => ({
  initialized: false,
  sidebarOpen: true,
  setInitialized: (value) => { set({ initialized: value }); },
  toggleSidebar: () => { set((s) => ({ sidebarOpen: !s.sidebarOpen })); },
}));
