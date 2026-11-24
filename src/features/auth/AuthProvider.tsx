import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { tr } from '../../lib/i18n';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signInWithTwitch: (redirectTo: string) => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const anonymousSignInRequest = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.provider_token) window.localStorage.setItem('bingo:twitch-provider-token', session.provider_token);
      if (event === 'SIGNED_OUT') window.localStorage.removeItem('bingo:twitch-provider-token');
      setLoading(false);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.error('Could not read the saved session:', error.message);
      setUser(data.session?.user ?? null);
      if (data.session?.provider_token) window.localStorage.setItem('bingo:twitch-provider-token', data.session.provider_token);
      setLoading(false);
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  const signInWithTwitch = useCallback(async (redirectTo: string) => {
    if (!supabase) throw new Error(tr('Сначала подключите Supabase в настройках проекта.', 'Connect Supabase in the project settings first.'));
    window.sessionStorage.setItem('bingo:return-to', new URL(redirectTo).searchParams.get('next') || '/dashboard');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'twitch',
      options: { redirectTo, scopes: 'user:read:email user:read:follows' },
    });
    if (error) throw error;
  }, []);

  const signInAnonymously = useCallback(async () => {
    const client = supabase;
    if (!client) throw new Error(tr('Supabase не настроен в проекте.', 'Supabase is not configured for this project.'));
    if (anonymousSignInRequest.current) return anonymousSignInRequest.current;

    const request = Promise.resolve().then(async () => {
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (session) return;
      const { error } = await client.auth.signInAnonymously();
      if (error) throw error;
    });
    anonymousSignInRequest.current = request;
    try {
      await request;
    } finally {
      if (anonymousSignInRequest.current === request) anonymousSignInRequest.current = null;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo(() => ({ user, loading, configured: isSupabaseConfigured, signInWithTwitch, signInAnonymously, signOut }), [user, loading, signInWithTwitch, signInAnonymously, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
