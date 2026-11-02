import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { formatError } from '../../lib/errors';
import { useAuth } from './AuthProvider';

export default function AuthPage() {
  const { signInWithEmail, configured } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const locationState = location.state as { from?: string } | null;
  const returnTo = locationState?.from?.startsWith('/') ? locationState.from : '/dashboard';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      window.sessionStorage.setItem('bingo:return-to', returnTo);
      const callbackUrl = new URL(`${window.location.origin}${window.location.pathname}`);
      callbackUrl.searchParams.set('next', returnTo);
      await signInWithEmail(email, callbackUrl.toString());
      setSent(true);
    } catch (cause) {
      setError(formatError(cause, 'Не получилось отправить ссылку для входа.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="placeholder-page">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Бинго — на главную"><span className="brand-mark">Б</span><span>БИНГО<span className="brand-period">.</span></span></Link>
      </header>
      <section className="placeholder-card login-card">
        <span className="eyebrow">БЫСТРЫЙ ВХОД · БЕЗ ПАРОЛЯ</span>
        <h1>{sent ? <>Проверь<br /><span>почту.</span></> : <>Твоя игра<br /><span>начинается здесь.</span></>}</h1>
        {sent ? (
          <div className="login-success" role="status">
            <span className="success-mark">↗</span>
            <div><strong>Ссылка уже в пути</strong><p>Открой письмо на <b>{email}</b> и нажми на ссылку — мы вернём тебя в игру.</p></div>
          </div>
        ) : (
          <>
            <p>Введи почту — отправим одноразовую ссылку для входа. Пароль придумывать не придётся.</p>
            {!configured && <p className="setup-callout">Почти готово: добавь URL и публичный ключ Supabase в `.env.local`, чтобы включить вход.</p>}
            <form className="login-form" onSubmit={submit}>
              <label htmlFor="login-email">Электронная почта</label>
              <input id="login-email" type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button button-primary" type="submit" disabled={!configured || busy}>{busy ? 'Отправляем…' : 'Отправить ссылку'} <span aria-hidden="true">↗</span></button>
            </form>
          </>
        )}
        <Link className="text-link login-back" to="/">← На главную</Link>
      </section>
    </main>
  );
}
