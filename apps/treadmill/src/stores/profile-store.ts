import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile } from '../types.ts';

interface ProfileState {
  profile: UserProfile | null;
  setProfile: (profile: UserProfile) => void;
  updateWeight: (weight: number) => void;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      profile: null,
      setProfile: (profile) => set({ profile }),
      updateWeight: (weight) =>
        set((state) => {
          if (!state.profile) return state;
          return { profile: { ...state.profile, weight } };
        }),
    }),
    { name: 'treadmill-profile' },
  ),
);
