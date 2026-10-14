'use client';
import { useEffect, useState } from 'react';

/* Sign-in with Firebase Authentication. The Firebase web settings come from the server (/api/jig/auth), so no key is built into the pages.
   No settings on the server (a laptop, the tests) means no sign-in at all: status "off". Guests use Firebase anonymous sign-in, so each visitor gets a private plant.
   Lessons kept from an earlier project: use the popup flow (the redirect flow looped), and authorise the live domain in Firebase. */

export type AuthUser = { uid: string; email: string | null; guest: boolean };
export type AuthState = { status: 'loading' | 'off' | 'out' | 'in'; user?: AuthUser };

let state: AuthState = { status: 'loading' };
let fb: { auth: any; mod: any } | null = null;
let started: Promise<void> | null = null;
const listeners = new Set<(s: AuthState) => void>();
const set = (s: AuthState) => { state = s; listeners.forEach((l) => l(s)); };

export function startAuth() {
  if (started) return started;
  started = (async () => {
    try {
      const r = await fetch('/api/jig/auth');
      const cfg = await r.json();
      if (!cfg.enabled) { set({ status: 'off' }); return; }
      const [app, mod] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
      const a = app.getApps().length ? app.getApp() : app.initializeApp(cfg.config);
      const auth = mod.getAuth(a);
      fb = { auth, mod };
      mod.onAuthStateChanged(auth, (u: any) => set(u ? { status: 'in', user: { uid: u.uid, email: u.email, guest: u.isAnonymous } } : { status: 'out' }));
    } catch {
      set({ status: 'off' });   // if sign-in cannot start, do not lock the person out of a local copy
    }
  })();
  return started;
}

/** The header every API call carries. Empty when sign-in is off or nobody is signed in. */
export async function authHeader(): Promise<Record<string, string>> {
  if (!fb?.auth.currentUser) return {};
  try { return { Authorization: 'Bearer ' + (await fb.auth.currentUser.getIdToken()) }; } catch { return {}; }
}

const MSG: Record<string, string> = {
  'auth/invalid-credential': 'That email and password do not match.',
  'auth/invalid-email': 'That email address is not valid.',
  'auth/email-already-in-use': 'An account with this email exists. Sign in instead.',
  'auth/weak-password': 'Use a password of at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/popup-closed-by-user': 'The Google window was closed before you finished.',
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
  'auth/operation-not-allowed': 'This sign-in method is not turned on yet.',
  'auth/network-request-failed': 'No connection. Check your network and try again.',
};
const fail = (e: any): never => { throw new Error(MSG[e?.code] || 'Sign-in failed. Please try again.'); };
const need = () => { if (!fb) throw new Error('Sign-in is still starting. Try again in a moment.'); return fb; };

export const signInGoogle = async () => { const { auth, mod } = need(); try { await mod.signInWithPopup(auth, new mod.GoogleAuthProvider()); } catch (e) { fail(e); } };
export const signInEmail = async (email: string, pw: string) => { const { auth, mod } = need(); try { await mod.signInWithEmailAndPassword(auth, email, pw); } catch (e) { fail(e); } };
export const signUpEmail = async (email: string, pw: string) => { const { auth, mod } = need(); try { await mod.createUserWithEmailAndPassword(auth, email, pw); } catch (e) { fail(e); } };
export const continueAsGuest = async () => { const { auth, mod } = need(); try { await mod.signInAnonymously(auth); } catch (e) { fail(e); } };
export const signOutUser = async () => { if (fb) await fb.mod.signOut(fb.auth); };

export function useAuth(): AuthState {
  const [s, setS] = useState<AuthState>(state);
  useEffect(() => { startAuth(); listeners.add(setS); setS(state); return () => { listeners.delete(setS); }; }, []);
  return s;
}
