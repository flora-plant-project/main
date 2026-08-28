import { create } from 'zustand';
import { client } from '../api/index.js';

/**
 * Auth state: the signed-in user plus the actions that wire auth screens to the
 * data client. Screens never call the client directly for auth — only through here.
 */
export const useAuthStore = create((set) => ({
  user: null,
  hydrated: false,
  busy: false,

  /** Restore the session from the client at app start. */
  async hydrate() {
    const res = await client.auth.me();
    set({ user: res.ok && res.data ? res.data.user : null, hydrated: true });
  },

  /** @param {{ username: string, password: string }} credentials */
  async signIn(credentials) {
    set({ busy: true });
    const res = await client.auth.login(credentials);
    set(res.ok ? { user: res.data.user, busy: false } : { busy: false });
    return res;
  },

  /** @param {{ username: string, password: string }} credentials */
  async signUp(credentials) {
    set({ busy: true });
    const res = await client.auth.signup(credentials);
    set(res.ok ? { user: res.data.user, busy: false } : { busy: false });
    return res;
  },

  async signOut() {
    await client.auth.logout();
    set({ user: null });
  },

  /** @param {'COASTAL'|'MOUNTAIN'|'BEKAA'|'SOUTH'} climateZone */
  async setClimateZone(climateZone) {
    const res = await client.me.update({ climateZone });
    if (res.ok) set({ user: res.data.user });
    return res;
  },
}));
