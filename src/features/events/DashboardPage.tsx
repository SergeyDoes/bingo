import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { EventRow } from '../../lib/database.types';
import { formatError } from '../../lib/errors';
import { getEventPhase } from '../../lib/phase';
import { useAuth } from '../auth/AuthProvider';
import { listHostEvents, listParticipantEvents, type ParticipantEvent } from './eventApi';
import { requireSupabase } from '../../lib/supabase';
import { locale, tr } from '../../lib/i18n';

type DashboardTab = 'created' | 'participating';
type CreatedSort = 'created_at' | 'signup_deadline' | 'finalized_at';
type ParticipatingSort = 'signup_deadline' | 'finalized_at' | 'card_updated_at';

function eventStatus(event: EventRow, now: Date): { label: string; className: string } {
  const phase = getEventPhase(event, now);
  if (phase === 'finalized') return { label: tr('Завершено', 'Finished'), className: 'status-final' };
  if (phase === 'active') return { label: tr('Идёт игра', 'In progress'), className: 'status-live' };
  return { label: tr('Набор игроков', 'Signups open'), className: 'status-open' };
}

function formatDate(date: string | null): string {
  if (!date) return tr('—', '—');
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(date));
}

function startDate(event: EventRow): string {
  return event.manual_started_at ?? event.signup_deadline;
}

function sortTimestamp(event: EventRow | ParticipantEvent, field: CreatedSort | ParticipatingSort): number | null {
  let value: string | null = null;
  if (field === 'created_at') value = event.created_at;
  else if (field === 'signup_deadline') value = startDate(event);
  else if (field === 'finalized_at') value = event.finalized_at;
  else if ('card_updated_at' in event) value = event.card_updated_at;
  return value ? new Date(value).getTime() : null;
}

function dateFields(event: EventRow | ParticipantEvent, tab: DashboardTab): Array<{ label: string; date: string | null; empty?: string }> {
  if (tab === 'created') return [
    { label: tr('Создано', 'Created'), date: event.created_at },
    { label: tr('Старт', 'Start'), date: startDate(event) },
    { label: tr('Финиш', 'Finished'), date: event.finalized_at },
  ];
  return [
    { label: tr('Старт', 'Start'), date: startDate(event) },
    { label: tr('Финиш', 'Finished'), date: event.finalized_at },
    { label: tr('Карточка обновлена', 'Card updated'), date: 'card_updated_at' in event ? event.card_updated_at : null, empty: tr('Нет отметки', 'No update') },
  ];
}

export default function DashboardPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [createdEvents, setCreatedEvents] = useState<EventRow[]>([]);
  const [participatingEvents, setParticipatingEvents] = useState<ParticipantEvent[]>([]);
  const [tab, setTab] = useState<DashboardTab>('created');
  const [createdSort, setCreatedSort] = useState<CreatedSort>('created_at');
  const [participatingSort, setParticipatingSort] = useState<ParticipatingSort>('signup_deadline');
  const [createdAscending, setCreatedAscending] = useState(false);
  const [participatingAscending, setParticipatingAscending] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [canCreateEvents, setCanCreateEvents] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const [hostRows, participantRows] = await Promise.all([
        listHostEvents(user.id),
        listParticipantEvents(user.id),
      ]);
      setCreatedEvents(hostRows);
      setParticipatingEvents(participantRows);
    } catch (cause) {
      setError(formatError(cause, tr('Не удалось загрузить события.', 'Could not load events.')));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let active = true;
    void requireSupabase().rpc('is_bingo_host_authorized').then(({ data, error }) => {
      if (!active) return;
      if (error) { setError(formatError(error, tr('Не удалось проверить права ведущего.', 'Could not check host permissions.'))); setCanCreateEvents(false); }
      else setCanCreateEvents(data);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const currentEvents = tab === 'created' ? createdEvents : participatingEvents;
  const sortField = tab === 'created' ? createdSort : participatingSort;
  const ascending = tab === 'created' ? createdAscending : participatingAscending;
  const sortedEvents = useMemo(() => [...currentEvents].sort((left, right) => {
    const leftTime = sortTimestamp(left, sortField);
    const rightTime = sortTimestamp(right, sortField);
    if (leftTime === null) return rightTime === null ? 0 : 1;
    if (rightTime === null) return -1;
    return (leftTime - rightTime) * (ascending ? 1 : -1);
  }), [currentEvents, sortField, ascending]);

  async function exit() {
    try {
      await signOut();
      navigate('/', { replace: true });
    } catch (cause) {
      setError(formatError(cause));
    }
  }

  function changeSort(value: string) {
    if (tab === 'created') {
      setCreatedSort(value as CreatedSort);
      setCreatedAscending(value === 'signup_deadline');
    } else {
      setParticipatingSort(value as ParticipatingSort);
      setParticipatingAscending(value === 'signup_deadline');
    }
  }

  function toggleOrder() {
    if (tab === 'created') setCreatedAscending((value) => !value);
    else setParticipatingAscending((value) => !value);
  }

  const count = currentEvents.length;
  const isEmpty = tab === 'created' ? tr('Созданных тобой бинго пока нет.', 'You have not created any bingo events yet.') : tr('Ты пока не участвуешь ни в одном бинго.', 'You are not playing in any bingo events yet.');

  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <Link className="brand" to="/" aria-label="Бинго — на главную"><span className="brand-mark">Б</span><span>БИНГО<span className="brand-period">.</span></span></Link>
        <div className="workspace-user"><span>{String(user?.user_metadata?.preferred_username || user?.user_metadata?.name || 'Twitch')}</span><button className="quiet-button" onClick={exit}>{tr('Выйти', 'Log out')} ↗</button></div>
      </header>
      <section className="workspace-intro">
        <span className="eyebrow"><span className="live-dot" /> {tr('МЕНЮ СОБЫТИЙ', 'EVENTS')}</span>
        <h1>{tr('Твои', 'Your')}<br /><span>bingo.</span></h1>
        <p>{tr('Выбери событие, чтобы управлять им или продолжить игру.', 'Choose an event to manage it or continue playing.')}</p>
      </section>
      <div className="dashboard-grid dashboard-grid-single">
        <section className="dashboard-events">
          <div className="panel-heading"><div><span className="eyebrow">{tr('СПИСОК', 'LIST')}</span><h2>{tr('Мои бинго', 'My bingo')}</h2></div><div className="dashboard-menu-actions">{canCreateEvents && <Link className="button button-primary button-small" to="/create">{tr('Создать бинго', 'Create bingo')} ↗</Link>}<span className="count-badge">{count.toString().padStart(2, '0')}</span></div></div>
          <div className="dashboard-list-toolbar">
            <div className="dashboard-tabs" role="tablist" aria-label={tr('Мои бинго', 'My bingo')}>
              <button type="button" className={tab === 'created' ? 'dashboard-tab dashboard-tab-active' : 'dashboard-tab'} role="tab" aria-selected={tab === 'created'} onClick={() => setTab('created')}>{tr('Созданы мной', 'Created by me')} <span>{createdEvents.length}</span></button>
              <button type="button" className={tab === 'participating' ? 'dashboard-tab dashboard-tab-active' : 'dashboard-tab'} role="tab" aria-selected={tab === 'participating'} onClick={() => setTab('participating')}>{tr('Участвую', 'Playing')} <span>{participatingEvents.length}</span></button>
            </div>
            <div className="dashboard-sort">
              <label htmlFor="dashboard-sort-field">{tr('Сортировать по', 'Sort by')}</label>
              <select id="dashboard-sort-field" className="text-input" value={sortField} onChange={(event) => changeSort(event.target.value)}>
                {tab === 'created' ? <><option value="created_at">{tr('Дате создания', 'Creation date')}</option><option value="signup_deadline">{tr('Дате старта', 'Start date')}</option><option value="finalized_at">{tr('Дате финиша', 'Finish date')}</option></> : <><option value="signup_deadline">{tr('Дате старта', 'Start date')}</option><option value="finalized_at">{tr('Дате финиша', 'Finish date')}</option><option value="card_updated_at">{tr('Обновлению карточки', 'Card update')}</option></>}
              </select>
              <button type="button" className="button button-outline button-small dashboard-sort-order" onClick={toggleOrder}>{ascending ? tr('Сначала ранние ↑', 'Oldest first ↑') : tr('Сначала поздние ↓', 'Newest first ↓')}</button>
            </div>
          </div>
          {error && <div className="inline-error" role="alert">{error}<button className="quiet-button" onClick={() => void refresh()}>{tr('Повторить', 'Retry')}</button></div>}
          {loading ? <div className="loading-panel">{tr('Загружаем события', 'Loading events')}<span className="loading-dots">•••</span></div> : sortedEvents.length === 0 ? (
            <div className="empty-events"><span className="empty-glyph">▦</span><strong>{tr('Поле пока пустое.', 'Nothing here yet.')}</strong><p>{tab === 'created' && canCreateEvents ? tr('Создай первое бинго, и оно появится в этом списке.', 'Create your first bingo event to see it here.') : isEmpty}</p>{tab === 'created' && canCreateEvents ? <Link className="button button-primary" to="/create">{tr('Создать первое бинго', 'Create your first bingo')} ↗</Link> : tab === 'participating' ? <Link className="button button-outline" to="/">{tr('Посмотреть открытые бинго', 'Browse open bingo')} ↗</Link> : null}</div>
          ) : (
            <div className="event-list">
              {sortedEvents.map((event) => {
                const status = eventStatus(event, now);
                const eventDates = dateFields(event, tab);
                return <Link className="event-list-card dashboard-event-card" to={tab === 'created' ? `/host/${event.id}` : `/play/${event.id}`} key={event.id}>
                  <span className="event-card-accent" />
                  <span className={`event-status ${status.className}`}><i />{status.label}</span>
                  <strong className="event-card-title"><span aria-hidden="true">{event.emoji}</span>{event.title}</strong>
                  <span className="dashboard-event-size">{event.grid_size} × {event.grid_size}</span>
                  <span className="dashboard-event-dates">{eventDates.map((field) => <span className="dashboard-event-date" key={field.label}><small>{field.label}</small><time title={field.date ?? undefined}>{field.date ? formatDate(field.date) : field.empty ?? '—'}</time></span>)}</span>
                  <span className="event-card-arrow">↗</span>
                </Link>;
              })}
            </div>
          )}
        </section>
      </div>
      <footer className="workspace-footer"><span>{tr('МОИ СОБЫТИЯ', 'MY EVENTS')}</span><Link to="/">{tr('НА ГЛАВНУЮ', 'HOME')} ↑</Link></footer>
    </main>
  );
}
