import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { EventRow } from '../../lib/database.types';
import { formatError } from '../../lib/errors';
import { getEventPhase } from '../../lib/phase';
import { useAuth } from '../auth/AuthProvider';
import CreateEventForm from './CreateEventForm';
import { createEvent, listHostEvents } from './eventApi';

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

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      setEvents(await listHostEvents(user.id));
    } catch (cause) {
      setError(formatError(cause, 'Не удалось загрузить события.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function onCreate(input: Parameters<typeof createEvent>[0]) {
    const created = await createEvent(input);
    navigate(`/host/${created.eventId}`);
  }

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
        <div className="workspace-user"><span>{user?.email}</span><button className="quiet-button" onClick={exit}>Выйти ↗</button></div>
      </header>
      <section className="workspace-intro">
        <span className="eyebrow"><span className="live-dot" /> ТВОЯ ИГРОВАЯ</span>
        <h1>События, которые<br /><span>ещё не случились.</span></h1>
        <p>Придумай повод, собери триггеры — а дальше игра пойдёт сама.</p>
      </section>
      <div className="dashboard-grid">
        <section className="dashboard-events">
          <div className="panel-heading"><h2>Мои события</h2><span className="count-badge">{events.length.toString().padStart(2, '0')}</span></div>
          {error && <div className="inline-error" role="alert">{error}<button className="quiet-button" onClick={() => void refresh()}>Повторить</button></div>}
          {loading ? <div className="loading-panel">Загружаем события<span className="loading-dots">•••</span></div> : events.length === 0 ? (
            <div className="empty-events"><span className="empty-glyph">▦</span><strong>Поле пока пустое.</strong><p>Создай первое событие — игроки смогут собрать карточки по твоим триггерам.</p></div>
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
        <aside className="create-panel"><CreateEventForm submitLabel="Создать событие" onSubmit={onCreate} /></aside>
      </div>
      <footer className="workspace-footer"><span>БИНГО · СОБЫТИЯ, КОТОРЫЕ СТОИТ ЖДАТЬ</span><Link to="/">НА ГЛАВНУЮ ↑</Link></footer>
    </main>
  );
}
