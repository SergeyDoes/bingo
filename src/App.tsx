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
import { locale, tr } from './lib/i18n';

function Brand() {
  return (
    <Link className="brand" to="/" aria-label={tr('Бинго — на главную', 'Bingo — home')}>
      <span className="brand-mark" aria-hidden="true">{tr('Б', 'B')}</span>
      <span>БИНГО<span className="brand-period">.</span></span>
    </Link>
  );
}

function LandingPage() {
  const { user } = useAuth();
  const canFilterByFollows = Boolean(user && !user.is_anonymous);
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
    void listPublicEvents().then(setPublicEvents).catch((cause) => setError(formatError(cause, tr('Не удалось загрузить публичные бинго.', 'Could not load public bingo events.')))).finally(() => {
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
      setError(formatError(cause, tr('Не удалось загрузить подписки Twitch.', 'Could not load Twitch follows.')));
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
        <nav className="topbar-nav" aria-label={tr('Основная навигация', 'Main navigation')}>
          {user ? <Link className="button button-small button-outline" to="/dashboard">{tr('Мои бинго', 'My bingo')} <span aria-hidden="true">↗</span></Link> : <Link className="button button-small button-outline" to="/login">{tr('Войти через Twitch', 'Log in with Twitch')} <span aria-hidden="true">↗</span></Link>}
        </nav>
      </header>
      <section className="public-home-section">
        <div className="public-home-heading"><span className="eyebrow"><span className="live-dot" /> {tr('ОТКРЫТЫЙ НАБОР', 'OPEN FOR PLAYERS')}</span><h1>{tr('Публичные', 'Public')}<br /><span>{tr('бинго.', 'bingo.')}</span></h1><p>{tr('Игры, в которые можно зайти прямо сейчас.', 'Games you can join right now.')}</p></div>
        {!user ? <div className="public-home-empty"><p>{tr('Войди через Twitch, чтобы смотреть публичные бинго. По приглашению можно присоединиться без входа.', 'Sign in with Twitch to browse public bingo. You can join without signing in using an invite link.')}</p><Link className="button button-primary" to="/login">{tr('Войти через Twitch', 'Log in with Twitch')} <span aria-hidden="true">↗</span></Link></div> : loadingEvents ? <div className="loading-panel">{tr('Ищем открытые бинго', 'Looking for open bingo events')}<span className="loading-dots">•••</span></div> : <>{canFilterByFollows && <label className="follow-filter"><input type="checkbox" checked={onlyFollowedHosts} disabled={loadingFollows} onChange={(event) => void toggleFollowFilter(event.target.checked)} /><span aria-hidden="true">✓</span><span>{tr('Только ведущие, на которых я подписан', 'Only hosts I follow')}{loadingFollows ? tr(' · загружаем…', ' · loading…') : ''}</span></label>}{error && <div className="inline-error" role="alert">{error}</div>}{visibleEvents.length ? <div className="public-home-list">{visibleEvents.map((event) => <Link className="public-home-card" to={`/e/${event.invite_token}`} key={event.id}><span className="public-home-card-mark">{event.emoji}</span><span className="public-home-card-main"><small>{tr('НАБОР ОТКРЫТ', 'OPEN FOR SIGNUPS')} · {event.grid_size} × {event.grid_size}</small><strong>{event.title}</strong><span>{tr('Ведущий', 'Host')} · {event.host_twitch_name || 'Twitch'}</span></span><span className="public-home-card-deadline">{tr('СТАРТ', 'START')}<br />{new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(event.signup_deadline))}</span><span className="event-card-arrow">↗</span></Link>)}</div> : <div className="public-home-empty"><p>{onlyFollowedHosts ? tr('Среди открытых бинго пока нет ведущих, на которых ты подписан.', 'None of the open bingo events are hosted by people you follow yet.') : tr('Пока нет открытых публичных бинго. Загляни позже или создай своё.', 'No public bingo events are open for signups yet. Check back later or create one.')}</p>{!onlyFollowedHosts && <Link className="button button-primary" to="/dashboard">{tr('Создать бинго', 'Create bingo')} <span aria-hidden="true">↗</span></Link>}</div>}</>}
      </section>
      <footer className="site-footer"><Brand /><span>{tr('ПУБЛИЧНЫЕ БИНГО · TWITCH', 'PUBLIC BINGO · TWITCH')}</span><span>© 2026</span></footer>
    </main>
  );
}

function PlaceholderPage() {
  return (
    <main className="placeholder-page">
      <header className="topbar"><Brand /></header>
      <section className="placeholder-card">
        <span className="eyebrow">{tr('СКОРО НАЧНЁМ', 'COMING SOON')}</span>
        <h1>{tr('Настраиваем', 'Setting up the')}<br /><span>{tr('игровое поле.', 'game board.')}</span></h1>
        <p>{tr('Для входа и сохранения событий потребуется подключить Supabase. Пока можно вернуться на главную и посмотреть, как устроена игра.', 'Supabase must be connected to sign in and save events. For now, return home to see how the game works.')}</p>
        <Link className="button button-primary" to="/">{tr('На главную', 'Home')} <span aria-hidden="true">↗</span></Link>
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
  if (loading) return <main className="workspace-page"><div className="loading-panel full-loading">{tr('Проверяем вход', 'Checking sign-in')}<span className="loading-dots">•••</span></div></main>;
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
        <Route path="/e/:inviteToken" element={<JoinEventPage />} />
        <Route path="/play/:eventId" element={<RequireAuth><ParticipantEventPage /></RequireAuth>} />
        <Route path="*" element={<PlaceholderPage />} />
      </Routes>
    </>
  );
}

export default function App() {
  return <AuthProvider><RoutedApp /></AuthProvider>;
}
