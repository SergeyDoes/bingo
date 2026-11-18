import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatError } from '../../lib/errors';
import { useAuth } from './AuthProvider';

export default function AuthPage() {
  const { signInWithTwitch, configured } = useAuth();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locationState = location.state as { from?: string } | null;
  const returnTo = locationState?.from?.startsWith('/') ? locationState.from : '/dashboard';

  async function signIn() {
    setBusy(true);
    setError('');
    try {
      const callbackUrl = new URL(`${window.location.origin}${window.location.pathname}`);
      callbackUrl.searchParams.set('next', returnTo);
      await signInWithTwitch(callbackUrl.toString());
    } catch (cause) {
      setError(formatError(cause, 'Не получилось войти через Twitch.'));
      setBusy(false);
    }
  }

  return (
    <main className="placeholder-page">
      <header className="topbar"><Link className="brand" to="/" aria-label="Бинго — на главную"><span className="brand-mark">Б</span><span>БИНГО<span className="brand-period">.</span></span></Link></header>
      <section className="placeholder-card login-card">
        <span className="eyebrow">ВХОД ЧЕРЕЗ TWITCH</span>
        <h1>Твоя игра<br /><span>начинается здесь.</span></h1>
        <p>Войди через Twitch, чтобы присоединиться к бинго или создать своё событие.</p>
        {!configured && <p className="setup-callout">Сначала подключи Supabase в настройках проекта.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary twitch-login-button" type="button" onClick={() => void signIn()} disabled={!configured || busy}>
          {busy ? 'Переходим в Twitch…' : 'Продолжить с Twitch'} <span aria-hidden="true">↗</span>
        </button>
        <Link className="text-link login-back" to="/">← На главную</Link>
      </section>
    </main>
  );
}
