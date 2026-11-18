import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { EventRow } from '../../lib/database.types';
import { formatError } from '../../lib/errors';
import { getEventPhase } from '../../lib/phase';
import { useAuth } from '../auth/AuthProvider';
import { listHostEvents } from './eventApi';
import { requireSupabase } from '../../lib/supabase';

function eventStatus(event: EventRow, now: Date): { label: string; className: string } {
  const phase = getEventPhase(event, now);
  if (phase === 'finalized') return { label: 'Завершено', className: 'status-final' };
  if (phase === 'active') return { label: 'Идёт игра', className: 'status-live' };
  return { label: 'Набор игроков', className: 'status-open' };
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

export default function DashboardPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [canCreateEvents, setCanCreateEvents] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const hostRows = await listHostEvents(user.id);
      setEvents(hostRows);
    } catch (cause) {
      setError(formatError(cause, 'Не удалось загрузить события.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let active = true;
    void requireSupabase().rpc('is_bingo_host_authorized').then(({ data, error }) => {
      if (!active) return;
      if (error) { setError(formatError(error, 'Не удалось проверить права ведущего.')); setCanCreateEvents(false); }
      else setCanCreateEvents(data);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function exit() {
    try {
      await signOut();
      navigate('/', { replace: true });
    } catch (cause) {
      setError(formatError(cause));
    }
  }

  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <Link className="brand" to="/" aria-label="Бинго — на главную"><span className="brand-mark">Б</span><span>БИНГО<span className="brand-period">.</span></span></Link>
        <div className="workspace-user"><span>{String(user?.user_metadata?.preferred_username || user?.user_metadata?.name || 'Twitch')}</span><button className="quiet-button" onClick={exit}>Выйти ↗</button></div>
      </header>
      <section className="workspace-intro">
        <span className="eyebrow"><span className="live-dot" /> МЕНЮ СОБЫТИЙ</span>
        <h1>Твои<br /><span>бинго.</span></h1>
        <p>Выбери событие, чтобы управлять им, или создай новое.</p>
      </section>
      <div className="dashboard-grid dashboard-grid-single">
        <section className="dashboard-events">
          <div className="panel-heading"><div><span className="eyebrow">СПИСОК</span><h2>Мои события</h2></div><div className="dashboard-menu-actions">{canCreateEvents && <Link className="button button-primary button-small" to="/create">Создать бинго ↗</Link>}<span className="count-badge">{events.length.toString().padStart(2, '0')}</span></div></div>
          {error && <div className="inline-error" role="alert">{error}<button className="quiet-button" onClick={() => void refresh()}>Повторить</button></div>}
          {loading ? <div className="loading-panel">Загружаем события<span className="loading-dots">•••</span></div> : events.length === 0 ? (
            <div className="empty-events"><span className="empty-glyph">▦</span><strong>Поле пока пустое.</strong><p>{canCreateEvents ? 'Создай первое бинго, и оно появится в этом списке.' : 'Когда тебя назначат ведущим, созданные тобой события появятся здесь.'}</p>{canCreateEvents && <Link className="button button-primary" to="/create">Создать первое бинго ↗</Link>}</div>
          ) : (
            <div className="event-list">
              {events.map((event) => {
                const status = eventStatus(event, now);
                return <Link className="event-list-card" to={`/host/${event.id}`} key={event.id}>
                  <span className="event-card-accent" />
                  <span className={`event-status ${status.className}`}><i />{status.label}</span>
                  <strong className="event-card-title"><span aria-hidden="true">{event.emoji}</span>{event.title}</strong>
                  <span className="event-list-meta">{event.grid_size} × {event.grid_size} <i>·</i> {status.label === 'Набор игроков' ? `Старт ${formatDate(event.signup_deadline)}` : formatDate(event.created_at)}</span>
                  <span className="event-card-arrow">↗</span>
                </Link>;
              })}
            </div>
          )}
        </section>
      </div>
      <footer className="workspace-footer"><span>БИНГО · СОБЫТИЯ, КОТОРЫЕ СТОИТ ЖДАТЬ</span><Link to="/">НА ГЛАВНУЮ ↑</Link></footer>
    </main>
  );
}
