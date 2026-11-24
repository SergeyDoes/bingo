import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CardCellRow, EventRow, EventTriggerRow, ParticipantRow } from '../../lib/database.types';
import { countCompletedLines } from '../../lib/bingo';
import { formatError } from '../../lib/errors';
import { getEventPhase } from '../../lib/phase';
import { useAuth } from '../auth/AuthProvider';
import Leaderboard from '../events/Leaderboard';
import { getEvent, getEventResults, getEventTriggers, type EventResult } from '../events/eventApi';
import { getParticipantCard, saveCard } from './cardApi';
import CardBuilder from './CardBuilder';
import { requireSupabase } from '../../lib/supabase';
import { language, locale, tr } from '../../lib/i18n';

function formatDate(date: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(date));
}

function toGridCells(gridSize: number, saved: CardCellRow[]): Array<string | null> {
  const cells = Array.from({ length: gridSize * gridSize }, () => null as string | null);
  saved.forEach((cell) => { cells[cell.position] = cell.trigger_id; });
  return cells;
}

export default function ParticipantEventPage() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [triggers, setTriggers] = useState<EventTriggerRow[]>([]);
  const [participant, setParticipant] = useState<ParticipantRow | null>(null);
  const [savedCells, setSavedCells] = useState<CardCellRow[]>([]);
  const savedCellsRef = useRef<CardCellRow[]>([]);
  const [results, setResults] = useState<EventResult[]>([]);
  const [draftCells, setDraftCells] = useState<Array<string | null>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(async () => {
    if (!eventId || !user) return;
    setError('');
    try {
      const eventData = await getEvent(eventId);
      const [triggerData, cardData] = await Promise.all([getEventTriggers(eventId), getParticipantCard(eventId, user.id)]);
      const resultData = getEventPhase(eventData) === 'finalized' ? await getEventResults(eventId) : [];
      const previousSaved = savedCellsRef.current;
      const validTriggerIds = new Set(triggerData.map((trigger) => trigger.id));
      const serverCells = toGridCells(eventData.grid_size, cardData.cells);
      const previousSavedGrid = toGridCells(eventData.grid_size, previousSaved);
      setDraftCells((current) => {
        const currentIsDirty = current.length === serverCells.length && current.some((id, index) => id !== previousSavedGrid[index]);
        const next = currentIsDirty ? current : serverCells;
        return next.map((id) => id && validTriggerIds.has(id) ? id : null);
      });
      setEvent(eventData);
      setTriggers(triggerData);
      setParticipant(cardData.participant);
      setSavedCells(cardData.cells);
      savedCellsRef.current = cardData.cells;
      setResults(resultData);
    } catch (cause) {
      setError(formatError(cause, tr('Не удалось загрузить игровое поле.', 'Could not load the game board.')));
    } finally {
      setLoading(false);
    }
  }, [eventId, user]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => { setNow(new Date()); void refresh(); }, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!eventId) return;
    const client = requireSupabase();
    const channel = client.channel(`participant-event-triggers-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_triggers', filter: `event_id=eq.${eventId}` }, () => {
        void refresh();
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [eventId, refresh]);

  const phase = event ? getEventPhase(event, now) : 'signup';
  const complete = Boolean(event && savedCells.length === event.grid_size * event.grid_size);
  const currentSavedIds = useMemo(() => savedCells.map((cell) => cell.trigger_id).join('|'), [savedCells]);
  const currentDraftIds = draftCells.map((id) => id ?? '').join('|');
  const dirty = currentSavedIds !== currentDraftIds;
  const occurredIds = useMemo(() => new Set(triggers.filter((trigger) => trigger.occurred).map((trigger) => trigger.id)), [triggers]);
  const occurredPositions = new Set(savedCells.filter((cell) => occurredIds.has(cell.trigger_id)).map((cell) => cell.position));
  const score = event ? countCompletedLines(event.grid_size, occurredPositions) : 0;

  async function persistCard() {
    if (!participant || !event || phase !== 'signup') return;
    setSaving(true);
    setError('');
    try {
      const payload = draftCells.flatMap((triggerId, position) => triggerId ? [{ position, triggerId }] : []);
      await saveCard(participant.id, payload);
      setNotice(payload.length === event.grid_size * event.grid_size ? tr('Карточка сохранена. До старта её ещё можно изменить.', 'Card saved. You can still edit it before the game starts.') : tr('Прогресс сохранён. Карточку можно будет дополнить до старта.', 'Progress saved. You can complete your card before the game starts.'));
      await refresh();
    } catch (cause) {
      setError(formatError(cause, tr('Не получилось сохранить карточку.', 'Could not save the card.')));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="workspace-page"><div className="loading-panel full-loading">{tr('Раскладываем карточки', 'Setting up your card')}<span className="loading-dots">•••</span></div></main>;
  if (!event || !participant) return <main className="workspace-page"><header className="workspace-topbar"><Link className="brand" to="/"><span className="brand-mark">Б</span><span>BINGO<span className="brand-period">.</span></span></Link></header><div className="not-found-card"><span className="eyebrow">{tr('НЕ УДАЛОСЬ ОТКРЫТЬ КАРТОЧКУ', 'COULD NOT OPEN CARD')}</span><p>{error || tr('Попроси ведущего прислать актуальную ссылку.', 'Ask the host to send you the current link.')}</p><Link className="button button-primary" to="/">{tr('На главную', 'Home')} <span>↗</span></Link></div></main>;

  const locked = phase !== 'signup';
  const status = phase === 'signup' ? tr('Собираем карточки', 'Build your cards') : phase === 'active' ? tr('Игра идёт', 'Game in progress') : tr('Итоги зафиксированы', 'Results finalized');

  return (
    <main className="workspace-page">
      <header className="workspace-topbar"><Link className="brand" to="/" aria-label={tr('Бинго — на главную', 'Bingo — home')}><span className="brand-mark">Б</span><span>BINGO<span className="brand-period">.</span></span></Link><div className="participant-view-actions">{event.host_id === user?.id && <Link className="quiet-link" to={`/host/${event.id}`}>{tr('УПРАВЛЕНИЕ', 'MANAGE')} ↗</Link>}<span className="participant-name">{tr('ИГРОК', 'PLAYER')} · {participant.display_name}</span></div></header>
      <section className="participant-event-heading">
        <div><span className={`event-status ${phase === 'signup' ? 'status-open' : phase === 'active' ? 'status-live' : 'status-final'}`}><i />{status}</span><h1><span className="event-title-emoji" aria-hidden="true">{event.emoji}</span>{event.title}</h1><p>{phase === 'signup' ? tr(`Выбери триггеры до ${formatDate(event.signup_deadline)}.`, `Choose your triggers by ${formatDate(event.signup_deadline)}.`) : phase === 'active' ? tr('Карточка заблокирована. Следи за тем, что сбылось.', 'Your card is locked. Watch for triggers as they happen.') : tr('Игра закончена — финальные результаты ниже.', 'The game is over. See the final results below.')}</p></div>
        {phase !== 'signup' && <div className="participant-score"><span>{tr('ТВОЙ СЧЁТ', 'YOUR SCORE')}</span><strong>{score.toString().padStart(2, '0')}</strong><small>{score === 1 ? tr('ЛИНИЯ', 'LINE') : language === 'ru' && score >= 2 && score <= 4 ? 'ЛИНИИ' : tr('ЛИНИЙ', 'LINES')}</small></div>}
      </section>

      {error && <div className="inline-error" role="alert">{error}<button className="quiet-button" onClick={() => void refresh()}>{tr('Обновить', 'Refresh')}</button></div>}
      {notice && <div className="inline-notice" role="status">{notice}<button className="quiet-button" onClick={() => setNotice('')} aria-label={tr('Скрыть сообщение', 'Dismiss message')}>×</button></div>}
      {locked && !complete && <div className="incomplete-warning"><span>!</span><div><strong>{tr('Карточка не попала в игру.', 'Your card was not included in the game.')}</strong><p>{tr(`К моменту старта в ней было ${savedCells.length} из ${event.grid_size * event.grid_size} ячеек. Незавершённые карточки не участвуют в подсчёте.`, `At the start, it had ${savedCells.length} of ${event.grid_size * event.grid_size} cells. Incomplete cards are not scored.`)}</p></div></div>}
      {locked && complete && phase === 'active' && <div className="participant-note"><span>✳</span><p>{tr('Карточка заблокирована. Когда ведущий отметит триггер, клетка подсветится здесь.', 'Your card is locked. Cells will light up when the host marks a trigger.')}</p></div>}

      <section className="participant-board-section">
        <div className="participant-board-heading"><div><span className="eyebrow">{tr('ТВОЯ КАРТОЧКА', 'YOUR CARD')}</span><h2>{locked ? tr('Игра началась', 'The game has started') : tr('Выбери триггеры', 'Choose your triggers')}</h2></div>{!locked && <span className="progress-pill">{draftCells.filter(Boolean).length} / {event.grid_size * event.grid_size}</span>}</div>
        <CardBuilder gridSize={event.grid_size} triggers={triggers} cells={locked ? toGridCells(event.grid_size, savedCells) : draftCells} locked={locked} saving={saving} onChange={setDraftCells} onSave={() => void persistCard()} />
        {!locked && dirty && <p className="unsaved-hint">{tr('Есть несохранённые изменения — нажми кнопку под списком триггеров.', 'You have unsaved changes. Use the button below the trigger list to save.')}</p>}
      </section>

      {phase === 'finalized' && <section className="leaderboard-section"><div className="participant-board-heading"><div><span className="eyebrow">{tr('ФИНАЛЬНЫЕ РЕЗУЛЬТАТЫ', 'FINAL RESULTS')}</span><h2>{tr('Таблица лидеров', 'Leaderboard')}</h2></div><span className="count-badge">{results.length.toString().padStart(2, '0')}</span></div><Leaderboard results={results} currentParticipantId={participant.id} /></section>}

      <footer className="workspace-footer"><span>{tr('СТАРТ', 'START')} · {formatDate(event.signup_deadline)}</span><Link to="/">BINGO · {tr('НА ГЛАВНУЮ', 'HOME')} ↑</Link></footer>
    </main>
  );
}
