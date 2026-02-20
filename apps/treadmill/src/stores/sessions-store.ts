import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TreadmillSession } from '../types.ts';

interface SessionsState {
  sessions: TreadmillSession[];
  addSession: (session: TreadmillSession) => void;
  deleteSession: (id: string) => void;
}

export const useSessionsStore = create<SessionsState>()(
  persist(
    (set) => ({
      sessions: [],
      addSession: (session) =>
        set((state) => ({ sessions: [session, ...state.sessions] })),
      deleteSession: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
        })),
    }),
    { name: 'treadmill-sessions' },
  ),
);

export function getSessionsByDate(
  sessions: TreadmillSession[],
  date: string,
): TreadmillSession[] {
  return sessions.filter((s) => s.date === date);
}

export function getSessionsInRange(
  sessions: TreadmillSession[],
  from: string,
  to: string,
): TreadmillSession[] {
  return sessions.filter((s) => s.date >= from && s.date <= to);
}
