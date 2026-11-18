import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signInWithTwitch: (redirectTo: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.error('Could not read the saved session:', error.message);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const signInWithTwitch = useCallback(async (redirectTo: string) => {
    if (!supabase) throw new Error('Сначала подключите Supabase в настройках проекта.');
    window.sessionStorage.setItem('bingo:return-to', new URL(redirectTo).searchParams.get('next') || '/dashboard');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'twitch',
      options: { redirectTo, scopes: 'user:read:email' },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo(() => ({ user, loading, configured: isSupabaseConfigured, signInWithTwitch, signOut }), [user, loading, signInWithTwitch, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
