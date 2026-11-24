import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatError } from '../../lib/errors';
import { useAuth } from './AuthProvider';
import { tr } from '../../lib/i18n';

export default function AuthPage() {
  const { signInWithTwitch, configured } = useAuth();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locationState = location.state as { from?: string } | null;
  const returnTo = locationState?.from?.startsWith('/') ? locationState.from : '/';

  async function signIn() {
    setBusy(true);
    setError('');
    try {
      const callbackUrl = new URL(`${window.location.origin}${window.location.pathname}`);
      callbackUrl.searchParams.set('next', returnTo);
      await signInWithTwitch(callbackUrl.toString());
    } catch (cause) {
      setError(formatError(cause, tr('Не получилось войти через Twitch.', 'Could not log in with Twitch.')));
      setBusy(false);
    }
  }

  return (
    <main className="placeholder-page">
      <header className="topbar"><Link className="brand" to="/" aria-label={tr('Бинго — на главную', 'Bingo — home')}><span className="brand-mark">Б</span><span>BINGO<span className="brand-period">.</span></span></Link></header>
      <section className="placeholder-card login-card">
        <span className="eyebrow">{tr('ВХОД ЧЕРЕЗ TWITCH', 'LOG IN WITH TWITCH')}</span>
        <h1>{tr('Войти', 'Log in')}<br /><span>{tr('в бинго.', 'to bingo.')}</span></h1>
        <p>{tr('Войди через Twitch, чтобы присоединиться к бинго или создать своё событие.', 'Log in with Twitch to join a bingo event or create your own.')}</p>
        {!configured && <p className="setup-callout">{tr('Сначала подключи Supabase в настройках проекта.', 'Connect Supabase in the project settings first.')}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary twitch-login-button" type="button" onClick={() => void signIn()} disabled={!configured || busy}>
          {busy ? tr('Переходим в Twitch…', 'Redirecting to Twitch…') : tr('Продолжить с Twitch', 'Continue with Twitch')} <span aria-hidden="true">↗</span>
        </button>
        <Link className="text-link login-back" to="/">← {tr('На главную', 'Home')}</Link>
      </section>
    </main>
  );
}
