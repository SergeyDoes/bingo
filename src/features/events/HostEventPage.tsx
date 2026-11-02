import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { EventRow, EventTriggerRow, ParticipantRow } from '../../lib/database.types';
import { formatError } from '../../lib/errors';
import { getEventPhase } from '../../lib/phase';
import { useAuth } from '../auth/AuthProvider';
import { joinEvent } from '../cards/cardApi';
import ActiveEventPanel from './ActiveEventPanel';
import CreateEventForm, { toLocalInputValue } from './CreateEventForm';
import Leaderboard from './Leaderboard';
import { finalizeEvent, getEvent, getEventParticipants, getEventResults, getEventTriggers, startEvent, updateEventSetup, type EventResult } from './eventApi';
import type { EventDraft } from './eventValidation';

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

export default function HostEventPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [triggers, setTriggers] = useState<EventTriggerRow[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [results, setResults] = useState<EventResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copyDone, setCopyDone] = useState(false);
  const [hostDisplayName, setHostDisplayName] = useState('');
  const [joiningAsPlayer, setJoiningAsPlayer] = useState(false);
  const [showPlayerJoin, setShowPlayerJoin] = useState(false);
  const [starting, setStarting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(async () => {
    if (!eventId) return;
    setError('');
    try {
      const eventData = await getEvent(eventId);
      const [triggerData, participantData] = await Promise.all([getEventTriggers(eventId), getEventParticipants(eventId)]);
      const resultData = getEventPhase(eventData) === 'finalized' ? await getEventResults(eventId) : [];
      setEvent(eventData);
      setTriggers(triggerData);
      setParticipants(participantData);
      setResults(resultData);
    } catch (cause) {
      setError(formatError(cause, 'Не удалось загрузить это событие.'));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => { setNow(new Date()); void refresh(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function save(input: EventDraft) {
    if (!eventId) return;
    await updateEventSetup(eventId, input);
    setNotice('Изменения сохранены.');
    await refresh();
  }

  async function copyInvite() {
    if (!event) return;
    const inviteUrl = `${window.location.origin}${window.location.pathname}#/e/${event.invite_token}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2200);
    } catch {
      setError('Браузер не разрешил скопировать ссылку. Выдели и скопируй её вручную.');
    }
  }

  async function joinAsPlayer(submitEvent: FormEvent<HTMLFormElement>) {
    submitEvent.preventDefault();
    if (!event || !hostDisplayName.trim()) return;
    setJoiningAsPlayer(true);
    setError('');
    try {
      const result = await joinEvent(event.invite_token, hostDisplayName);
      if (!result.participantId) throw new Error('Не удалось создать карточку игрока.');
      navigate(`/play/${event.id}`);
    } catch (cause) {
      setError(formatError(cause, 'Не получилось присоединиться к событию.'));
    } finally {
      setJoiningAsPlayer(false);
    }
  }

  async function startEarly() {
    if (!eventId) return;
    setStarting(true);
    setError('');
    try {
      await startEvent(eventId);
      setNotice('Игра началась. Карточки участников заблокированы.');
      await refresh();
    } catch (cause) {
      setError(formatError(cause, 'Не получилось запустить событие.'));
    } finally {
      setStarting(false);
    }
  }

  async function finishEvent() {
    if (!eventId || !window.confirm('Завершить событие и зафиксировать таблицу? Отменить это действие нельзя.')) return;
    setFinalizing(true);
    setError('');
    try {
      await finalizeEvent(eventId);
      setNotice('Итоги зафиксированы.');
      await refresh();
    } catch (cause) {
      setError(formatError(cause, 'Не получилось завершить событие.'));
    } finally {
      setFinalizing(false);
    }
  }

  if (loading) return <main className="workspace-page"><div className="loading-panel full-loading">Загружаем событие<span className="loading-dots">•••</span></div></main>;
  if (!event) return <main className="workspace-page"><header className="workspace-topbar"><Link className="brand" to="/dashboard"><span className="brand-mark">Б</span><span>БИНГО<span className="brand-period">.</span></span></Link></header><div className="not-found-card"><span className="eyebrow">СОБЫТИЕ НЕ НАЙДЕНО</span><p>{error || 'У тебя нет доступа к этой странице.'}</p><Link className="button button-primary" to="/dashboard">К моим событиям <span>↗</span></Link></div></main>;

  const phase = getEventPhase(event, now);
  const isHostParticipant = participants.some((participant) => participant.user_id === user?.id);
  const inviteUrl = `${window.location.origin}${window.location.pathname}#/e/${event.invite_token}`;
  const initial: Partial<EventDraft> = {
    title: event.title,
    emoji: event.emoji,
    gridSize: event.grid_size,
    signupDeadline: toLocalInputValue(new Date(event.signup_deadline)),
    triggers: triggers.map((trigger) => ({ label: trigger.label, emoji: trigger.emoji })),
  };

  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <Link className="brand" to="/dashboard" aria-label="К событиям"><span className="brand-mark">Б</span><span>БИНГО<span className="brand-period">.</span></span></Link>
        <Link className="quiet-link" to="/dashboard">← МОИ СОБЫТИЯ</Link>
      </header>
      <div className="event-page-heading">
        <div>
          <span className={`event-status ${phase === 'signup' ? 'status-open' : phase === 'active' ? 'status-live' : 'status-final'}`}><i />{phase === 'signup' ? 'Набор игроков' : phase === 'active' ? 'Идёт игра' : 'Завершено'}</span>
          <h1><span className="event-title-emoji" aria-hidden="true">{event.emoji}</span>{event.title}</h1>
          <p>{event.grid_size} × {event.grid_size} · {triggers.length} триггеров · {participants.length} игроков</p>
        </div>
        <div className="event-page-actions">
          {isHostParticipant && <Link className="button button-outline" to={`/play/${event.id}`}>Моя карточка <span aria-hidden="true">↗</span></Link>}
          {phase === 'signup' && !isHostParticipant && <button className="button button-outline" type="button" onClick={() => setShowPlayerJoin((visible) => !visible)}>{showPlayerJoin ? 'Не сейчас' : 'Играть самому'} <span aria-hidden="true">↗</span></button>}
          {phase === 'signup' && <button className="button button-primary" onClick={() => void startEarly()} disabled={starting}>{starting ? 'Запускаем…' : 'Стартовать сейчас'} <span aria-hidden="true">↗</span></button>}
          {phase === 'active' && <button className="button button-outline" onClick={() => void finishEvent()} disabled={finalizing}>{finalizing ? 'Фиксируем…' : 'Завершить и подвести итоги'} <span aria-hidden="true">✓</span></button>}
          {phase === 'signup' && <small>Карточки заблокируются сразу</small>}
        </div>
      </div>

      {showPlayerJoin && phase === 'signup' && !isHostParticipant && <form className="host-player-join" onSubmit={(submitEvent) => void joinAsPlayer(submitEvent)}>
        <div><label htmlFor="host-player-name">Имя в игре</label><input id="host-player-name" autoComplete="nickname" maxLength={32} placeholder="Как тебя будут звать за столом?" value={hostDisplayName} onChange={(inputEvent) => setHostDisplayName(inputEvent.target.value)} required /></div>
        <button className="button button-primary" type="submit" disabled={joiningAsPlayer}>{joiningAsPlayer ? 'Заходим…' : 'Создать свою карточку'} <span aria-hidden="true">↗</span></button>
      </form>}

      {error && <div className="inline-error" role="alert">{error}</div>}
      {notice && <div className="inline-notice" role="status">{notice}<button className="quiet-button" onClick={() => setNotice('')} aria-label="Скрыть сообщение">×</button></div>}

      <section className="invite-panel">
        <div><span className="eyebrow">ПРИГЛАСИ ИГРОКОВ</span><strong>Одна ссылка — и все в игре.</strong><p>{phase === 'signup' ? `Регистрация и выбор карточек до ${formatDate(event.signup_deadline)}.` : 'Новые игроки уже не присоединятся. Карточки участников заблокированы.'}</p></div>
        <div className="invite-copy"><code>{inviteUrl}</code><button className="button button-outline button-small" type="button" onClick={() => void copyInvite()} aria-label={copyDone ? 'Ссылка скопирована' : 'Скопировать приглашение'}>{copyDone ? 'Скопировано ✓' : 'Копировать ↗'}</button></div>
      </section>

      <div className="host-content-grid">
        {phase === 'signup' ? (
          <section className="host-setup-panel"><CreateEventForm key={`${event.updated_at}-${triggers.length}`} initial={initial} allowGridSize={false} submitLabel="Сохранить изменения" onSubmit={save} /><p className="field-hint setup-warning">Если убрать триггер, он пропадёт из карточек игроков. До старта они смогут выбрать замену.</p></section>
        ) : phase === 'active' ? (
          <ActiveEventPanel eventId={event.id} triggers={triggers} onRefresh={refresh} />
        ) : (
          <section className="host-trigger-panel"><div className="panel-heading"><div><span className="eyebrow">ТРИГГЕРЫ СОБЫТИЯ</span><h2>Что уже произошло?</h2></div><span className="count-badge">{triggers.filter((trigger) => trigger.occurred).length}/{triggers.length}</span></div><div className="trigger-status-list">{triggers.map((trigger) => <div className={`trigger-status-row ${trigger.occurred ? 'trigger-done' : ''}`} key={trigger.id}><span className="trigger-check">{trigger.occurred ? '✓' : '·'}</span><span className="trigger-status-emoji" aria-hidden="true">{trigger.emoji}</span><span>{trigger.label}</span></div>)}</div><p className="field-hint">Отметки ведущего появятся на карточках участников.</p></section>
        )}
        <aside className="participant-panel"><div className="panel-heading"><div><span className="eyebrow">ЗА СТОЛОМ</span><h2>Игроки</h2></div><span className="count-badge">{participants.length.toString().padStart(2, '0')}</span></div>{participants.length ? <div className="participant-list">{participants.map((participant, index) => <div className="participant-row" key={participant.id}><span className="participant-avatar">{participant.display_name.trim().slice(0, 1).toLocaleUpperCase('ru-RU')}</span><span>{participant.display_name}</span><small>{String(index + 1).padStart(2, '0')}</small></div>)}</div> : <div className="participant-empty">Пока никого нет. Поделись ссылкой, чтобы открыть набор.</div>}</aside>
      </div>

      {phase === 'finalized' && <section className="leaderboard-section"><div className="participant-board-heading"><div><span className="eyebrow">ФИНАЛЬНЫЕ РЕЗУЛЬТАТЫ</span><h2>Таблица лидеров</h2></div><span className="count-badge">{results.length.toString().padStart(2, '0')}</span></div><Leaderboard results={results} /></section>}

      <footer className="workspace-footer"><span>ДЕДЛАЙН · {formatDate(event.signup_deadline)}</span><Link to="/dashboard">К МОИМ СОБЫТИЯМ ↑</Link></footer>
    </main>
  );
}
