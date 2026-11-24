import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { USE_MOCKS } from '../config';

// Sign-in is OPTIONAL. It never gates an on-scene screen.
// It only links ID feedback / photos to a user and syncs history.
type User = { id: string; email: string } | null;
type Ctx = {
  user: User;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setUser(u ? { id: u.id, email: u.email ?? '' } : null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ? { id: s.user.id, email: s.user.email ?? '' } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: Ctx = {
    user,
    // Email one-time code — no deep link needed, works through ngrok / Expo Go.
    sendCode: async (email) => {
      if (USE_MOCKS || !supabase) return;
      const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw error;
    },
    verifyCode: async (email, code) => {
      if (USE_MOCKS || !supabase) {
        if (code !== '123456') throw new Error('Mock mode: use code 123456');
        setUser({ id: 'mock-user', email });
        return;
      }
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw error;
    },
    signOut: async () => {
      if (supabase) await supabase.auth.signOut();
      setUser(null);
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
