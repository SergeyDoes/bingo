import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AuthPage from './features/auth/AuthPage';
import { AuthProvider, useAuth } from './features/auth/AuthProvider';
import CallbackPage from './features/auth/CallbackPage';
import DashboardPage from './features/events/DashboardPage';
import CreateEventPage from './features/events/CreateEventPage';
import HostEventPage from './features/events/HostEventPage';
import JoinEventPage from './features/cards/JoinEventPage';
import ParticipantEventPage from './features/cards/ParticipantEventPage';
import { getFollowedTwitchIds, listPublicEvents } from './features/events/eventApi';
import type { EventRow } from './lib/database.types';
import { formatError } from './lib/errors';

function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Бинго — на главную">
      <span className="brand-mark" aria-hidden="true">Б</span>
      <span>БИНГО<span className="brand-period">.</span></span>
    </Link>
  );
}

function LandingPage() {
  const { user } = useAuth();
  const [publicEvents, setPublicEvents] = useState<EventRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState('');
  const [onlyFollowedHosts, setOnlyFollowedHosts] = useState(false);
  const [followedHostIds, setFollowedHostIds] = useState<Set<string>>(() => new Set());
  const [loadingFollows, setLoadingFollows] = useState(false);
  const [followsLoaded, setFollowsLoaded] = useState(false);

  useEffect(() => {
    if (!user) { setPublicEvents([]); return; }
    let active = true;
    setLoadingEvents(true);
    void listPublicEvents().then(setPublicEvents).catch((cause) => setError(formatError(cause, 'Не удалось загрузить публичные бинго.'))).finally(() => {
      if (active) setLoadingEvents(false);
    });
    return () => { active = false; };
  }, [user]);

  async function toggleFollowFilter(checked: boolean) {
    setOnlyFollowedHosts(checked);
    if (!checked || followsLoaded) return;
    setLoadingFollows(true);
    setError('');
    try {
      setFollowedHostIds(await getFollowedTwitchIds());
      setFollowsLoaded(true);
    } catch (cause) {
      setOnlyFollowedHosts(false);
      setError(formatError(cause, 'Не удалось загрузить подписки Twitch.'));
    } finally {
      setLoadingFollows(false);
    }
  }

  const visibleEvents = onlyFollowedHosts
    ? publicEvents.filter((event) => event.host_twitch_id && followedHostIds.has(event.host_twitch_id))
    : publicEvents;

  return (
    <main className="landing landing-directory">
      <header className="topbar">
        <Brand />
        <nav className="topbar-nav" aria-label="Основная навигация">
          {user ? <Link className="button button-small button-outline" to="/dashboard">Мои бинго <span aria-hidden="true">↗</span></Link> : <Link className="button button-small button-outline" to="/login">Войти через Twitch <span aria-hidden="true">↗</span></Link>}
        </nav>
      </header>
      <section className="public-home-section">
        <div className="public-home-heading"><span className="eyebrow"><span className="live-dot" /> ОТКРЫТЫЙ НАБОР</span><h1>Публичные<br /><span>бинго.</span></h1><p>Игры, в которые можно зайти прямо сейчас.</p></div>
        {!user ? <div className="public-home-empty"><p>Войди через Twitch, чтобы увидеть открытые бинго и присоединиться.</p><Link className="button button-primary" to="/login">Войти через Twitch <span aria-hidden="true">↗</span></Link></div> : loadingEvents ? <div className="loading-panel">Ищем открытые бинго<span className="loading-dots">•••</span></div> : <><label className="follow-filter"><input type="checkbox" checked={onlyFollowedHosts} disabled={loadingFollows} onChange={(event) => void toggleFollowFilter(event.target.checked)} /><span aria-hidden="true">✓</span><span>Только ведущие, на которых я подписан{loadingFollows ? ' · загружаем…' : ''}</span></label>{error && <div className="inline-error" role="alert">{error}</div>}{visibleEvents.length ? <div className="public-home-list">{visibleEvents.map((event) => <Link className="public-home-card" to={`/e/${event.invite_token}`} key={event.id}><span className="public-home-card-mark">{event.emoji}</span><span className="public-home-card-main"><small>НАБОР ОТКРЫТ · {event.grid_size} × {event.grid_size}</small><strong>{event.title}</strong><span>Ведущий · {event.host_twitch_name || 'Twitch'}</span></span><span className="public-home-card-deadline">СТАРТ<br />{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(event.signup_deadline))}</span><span className="event-card-arrow">↗</span></Link>)}</div> : <div className="public-home-empty"><p>{onlyFollowedHosts ? 'Среди открытых бинго пока нет ведущих, на которых ты подписан.' : 'Пока нет открытых публичных бинго. Загляни позже или создай своё.'}</p>{!onlyFollowedHosts && <Link className="button button-primary" to="/dashboard">Создать бинго <span aria-hidden="true">↗</span></Link>}</div>}</>}
      </section>
      <footer className="site-footer"><Brand /><span>ПУБЛИЧНЫЕ БИНГО · TWITCH</span><span>© 2026</span></footer>
    </main>
  );
}

function PlaceholderPage() {
  return (
    <main className="placeholder-page">
      <header className="topbar"><Brand /></header>
      <section className="placeholder-card">
        <span className="eyebrow">СКОРО НАЧНЁМ</span>
        <h1>Настраиваем<br /><span>игровое поле.</span></h1>
        <p>Для входа и сохранения событий потребуется подключить Supabase. Пока можно вернуться на главную и посмотреть, как устроена игра.</p>
        <Link className="button button-primary" to="/">На главную <span aria-hidden="true">↗</span></Link>
      </section>
    </main>
  );
}

function AuthRedirector() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const next = window.sessionStorage.getItem('bingo:return-to');
    if (next && ['/','/login','/auth/callback'].includes(location.pathname)) {
      window.sessionStorage.removeItem('bingo:return-to');
      navigate(next.startsWith('/') ? next : '/dashboard', { replace: true });
    } else if (location.pathname === '/login' || location.pathname === '/auth/callback') {
      navigate('/dashboard', { replace: true });
    }
  }, [location.pathname, navigate, user]);

  return null;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuth();
  const location = useLocation();
  if (!configured) return <PlaceholderPage />;
  if (loading) return <main className="workspace-page"><div className="loading-panel full-loading">Проверяем вход<span className="loading-dots">•••</span></div></main>;
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return children;
}

function RoutedApp() {
  return (
    <>
      <AuthRedirector />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/auth/callback" element={<CallbackPage />} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/create" element={<RequireAuth><CreateEventPage /></RequireAuth>} />
        <Route path="/host/:eventId" element={<RequireAuth><HostEventPage /></RequireAuth>} />
        <Route path="/e/:inviteToken" element={<RequireAuth><JoinEventPage /></RequireAuth>} />
        <Route path="/play/:eventId" element={<RequireAuth><ParticipantEventPage /></RequireAuth>} />
        <Route path="*" element={<PlaceholderPage />} />
      </Routes>
    </>
  );
}

export default function App() {
  return <AuthProvider><RoutedApp /></AuthProvider>;
}
