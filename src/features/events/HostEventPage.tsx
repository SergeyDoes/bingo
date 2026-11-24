import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { EventRow, EventTriggerRow, ParticipantRow } from '../../lib/database.types';
import { formatError } from '../../lib/errors';
import { getEventPhase } from '../../lib/phase';
import { useAuth } from '../auth/AuthProvider';
import { joinEvent } from '../cards/cardApi';
import ActiveEventPanel from './ActiveEventPanel';
import CreateEventForm, { toLocalInputValue } from './CreateEventForm';
import CardDraftPreview from './CardDraftPreview';
import Leaderboard from './Leaderboard';
import { deleteEvent, finalizeEvent, getEvent, getEventModerators, getEventParticipants, getEventResults, getEventTriggers, setEventModerator, startEvent, updateEventSetup, type EventResult } from './eventApi';
import type { EventDraft } from './eventValidation';
import { locale, tr } from '../../lib/i18n';

function formatDate(date: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(date));
}

export default function HostEventPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [triggers, setTriggers] = useState<EventTriggerRow[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [moderatorIds, setModeratorIds] = useState<string[]>([]);
  const [draftPreview, setDraftPreview] = useState<EventDraft | null>(null);
  const [results, setResults] = useState<EventResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copyDone, setCopyDone] = useState(false);
  const [joiningAsPlayer, setJoiningAsPlayer] = useState(false);
  const [starting, setStarting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(async () => {
    if (!eventId) return;
    setError('');
    try {
      const eventData = await getEvent(eventId);
      const [triggerData, participantData, moderatorData] = await Promise.all([getEventTriggers(eventId), getEventParticipants(eventId), getEventModerators(eventId)]);
      const resultData = getEventPhase(eventData) === 'finalized' ? await getEventResults(eventId) : [];
      setEvent(eventData);
      setTriggers(triggerData);
      setParticipants(participantData);
      setModeratorIds(moderatorData);
      setResults(resultData);
    } catch (cause) {
      setError(formatError(cause, tr('Не удалось загрузить это событие.', 'Could not load this event.')));
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
    setNotice(tr('Изменения сохранены.', 'Changes saved.'));
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
      setError(tr('Браузер не разрешил скопировать ссылку. Выдели и скопируй её вручную.', 'Your browser could not copy the link. Select and copy it manually.'));
    }
  }

  async function joinAsPlayer() {
    if (!event) return;
    setJoiningAsPlayer(true);
    setError('');
    try {
      const result = await joinEvent(event.invite_token);
      if (!result.participantId) throw new Error(tr('Не удалось создать карточку игрока.', 'Could not create a player card.'));
      navigate(`/play/${event.id}`);
    } catch (cause) {
      setError(formatError(cause, tr('Не получилось присоединиться к событию.', 'Could not join the event.')));
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
      setNotice(tr('Игра началась. Карточки участников заблокированы.', 'The game has started. Player cards are locked.'));
      await refresh();
    } catch (cause) {
      setError(formatError(cause, tr('Не получилось запустить событие.', 'Could not start the event.')));
    } finally {
      setStarting(false);
    }
  }

  async function finishEvent() {
    if (!eventId || !window.confirm(tr('Завершить событие и зафиксировать таблицу? Отменить это действие нельзя.', 'Finish the event and finalize the leaderboard? This cannot be undone.'))) return;
    setFinalizing(true);
    setError('');
    try {
      await finalizeEvent(eventId);
      setNotice(tr('Итоги зафиксированы.', 'Results finalized.'));
      await refresh();
    } catch (cause) {
      setError(formatError(cause, tr('Не получилось завершить событие.', 'Could not finish the event.')));
    } finally {
      setFinalizing(false);
    }
  }

  function copyEvent() {
    if (!event) return;
    const copyDraft: EventDraft = {
      title: `${event.title.slice(0, 72)} — ${tr('копия', 'copy')}`,
      emoji: event.emoji,
      gridSize: event.grid_size,
      signupDeadline: toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      isPublic: false,
      triggers: triggers.map((trigger) => ({ label: trigger.label, emoji: trigger.emoji })),
    };
    navigate('/create', { state: { copyDraft } });
  }

  async function removeEvent() {
    if (!eventId || !event || !window.confirm(tr(`Удалить «${event.title}» вместе с карточками участников и результатами? Это действие нельзя отменить.`, `Delete “${event.title}” along with player cards and results? This cannot be undone.`))) return;
    setDeleting(true);
    setError('');
    try {
      await deleteEvent(eventId);
      navigate('/dashboard', { replace: true });
    } catch (cause) {
      setError(formatError(cause, tr('Не удалось удалить бинго.', 'Could not delete bingo.')));
      setDeleting(false);
    }
  }

  if (loading) return <main className="workspace-page"><div className="loading-panel full-loading">{tr('Загружаем событие', 'Loading event')}<span className="loading-dots">•••</span></div></main>;
  if (!event) return <main className="workspace-page"><header className="workspace-topbar"><Link className="brand" to="/dashboard"><span className="brand-mark">Б</span><span>BINGO<span className="brand-period">.</span></span></Link></header><div className="not-found-card"><span className="eyebrow">{tr('СОБЫТИЕ НЕ НАЙДЕНО', 'EVENT NOT FOUND')}</span><p>{error || tr('У тебя нет доступа к этой странице.', 'You do not have access to this page.')}</p><Link className="button button-primary" to="/dashboard">{tr('К моим событиям', 'My events')} <span>↗</span></Link></div></main>;

  const phase = getEventPhase(event, now);
  const isHostParticipant = participants.some((participant) => participant.user_id === user?.id);
  const inviteUrl = `${window.location.origin}${window.location.pathname}#/e/${event.invite_token}`;
  const initial: Partial<EventDraft> = {
    title: event.title,
    emoji: event.emoji,
    gridSize: event.grid_size,
    signupDeadline: toLocalInputValue(new Date(event.signup_deadline)),
    isPublic: event.is_public,
    triggers: triggers.map((trigger) => ({ label: trigger.label, emoji: trigger.emoji })),
  };
  const isHost = event.host_id === user?.id;
  const canModerate = isHost || Boolean(user && moderatorIds.includes(user.id));

  async function toggleModerator(participant: ParticipantRow) {
    if (!event) return;
    const enabled = !moderatorIds.includes(participant.user_id);
    try {
      await setEventModerator(event.id, participant.user_id, enabled);
      setModeratorIds((current) => enabled ? [...current, participant.user_id] : current.filter((id) => id !== participant.user_id));
    } catch (cause) {
      setError(formatError(cause, tr('Не удалось изменить роль модератора.', 'Could not update moderator permissions.')));
    }
  }

  return (
    <main className="workspace-page">
      <header className="workspace-topbar">
        <Link className="brand" to="/dashboard" aria-label={tr('К событиям', 'My events')}><span className="brand-mark">Б</span><span>BINGO<span className="brand-period">.</span></span></Link>
        <Link className="quiet-link" to="/dashboard">← {tr('МОИ СОБЫТИЯ', 'MY EVENTS')}</Link>
      </header>
      <div className="event-page-heading">
        <div>
          <span className={`event-status ${phase === 'signup' ? 'status-open' : phase === 'active' ? 'status-live' : 'status-final'}`}><i />{phase === 'signup' ? tr('Набор игроков', 'Signups open') : phase === 'active' ? tr('Идёт игра', 'In progress') : tr('Завершено', 'Finished')}</span>
          <h1><span className="event-title-emoji" aria-hidden="true">{event.emoji}</span>{event.title}</h1>
          <p>{event.grid_size} × {event.grid_size} · {triggers.length} {tr('триггеров', 'triggers')} · {participants.length} {tr('игроков', 'players')}</p>
        </div>
        <div className="event-page-actions">
          {isHost && <button className="button button-outline" type="button" onClick={copyEvent}>{tr('Копировать бинго', 'Copy bingo')} <span aria-hidden="true">↗</span></button>}
          {isHost && <button className="button button-outline event-delete-button" type="button" onClick={() => void removeEvent()} disabled={deleting}>{deleting ? tr('Удаляем…', 'Deleting…') : tr('Удалить бинго', 'Delete bingo')} <span aria-hidden="true">×</span></button>}
          {isHostParticipant && <Link className="button button-outline" to={`/play/${event.id}`}>{tr('Моя карточка', 'My card')} <span aria-hidden="true">↗</span></Link>}
          {phase === 'signup' && !isHostParticipant && <button className="button button-outline" type="button" onClick={() => void joinAsPlayer()} disabled={joiningAsPlayer}>{joiningAsPlayer ? tr('Подключаемся…', 'Joining…') : `${tr('Играть как', 'Play as')} ${String(user?.user_metadata?.name || 'Twitch')}`} <span aria-hidden="true">↗</span></button>}
          {phase === 'signup' && isHost && <button className="button button-primary" onClick={() => void startEarly()} disabled={starting}>{starting ? tr('Запускаем…', 'Starting…') : tr('Стартовать сейчас', 'Start now')} <span aria-hidden="true">↗</span></button>}
          {phase === 'active' && isHost && <button className="button button-outline" onClick={() => void finishEvent()} disabled={finalizing}>{finalizing ? tr('Фиксируем…', 'Finalizing…') : tr('Завершить и подвести итоги', 'End event and finalize results')} <span aria-hidden="true">✓</span></button>}
          {phase === 'signup' && isHost && <small>{tr('Карточки заблокируются сразу', 'Cards will lock immediately')}</small>}
        </div>
      </div>

      {error && <div className="inline-error" role="alert">{error}</div>}
      {notice && <div className="inline-notice" role="status">{notice}<button className="quiet-button" onClick={() => setNotice('')} aria-label={tr('Скрыть сообщение', 'Dismiss message')}>×</button></div>}

      <section className="invite-panel">
        <div><span className="eyebrow">{tr('ПРИГЛАСИТЕЛЬНАЯ ССЫЛКА', 'INVITE LINK')}</span><strong>{tr('Ссылка на событие', 'Event link')}</strong><p>{phase === 'signup' ? tr(`Выбор карточек открыт до ${formatDate(event.signup_deadline)}.`, `Card selection is open until ${formatDate(event.signup_deadline)}.`) : tr('Набор закрыт. Карточки участников заблокированы.', 'Signups are closed. Player cards are locked.')}</p></div>
        <div className="invite-copy"><code>{inviteUrl}</code><button className="button button-outline button-small" type="button" onClick={() => void copyInvite()} aria-label={copyDone ? tr('Ссылка скопирована', 'Link copied') : tr('Скопировать приглашение', 'Copy invite link')}>{copyDone ? tr('Скопировано ✓', 'Copied ✓') : tr('Копировать ↗', 'Copy ↗')}</button></div>
      </section>

      <div className={`host-content-grid ${phase === 'signup' && isHost ? 'host-content-grid-signup' : ''}`}>
        {phase === 'signup' && isHost ? (
          <section className="host-setup-panel"><div className="host-edit-layout"><CreateEventForm key={`${event.updated_at}-${triggers.length}`} initial={initial} allowGridSize={false} submitLabel="Сохранить изменения" onSubmit={save} onDraftChange={setDraftPreview} />{draftPreview && <CardDraftPreview gridSize={draftPreview.gridSize} triggers={draftPreview.triggers} />}</div><p className="field-hint setup-warning">{tr('Если убрать триггер, он пропадёт из карточек игроков. До старта они смогут выбрать замену.', 'Removing a trigger also removes it from player cards. Before the game starts, players can choose a replacement.')}</p></section>
        ) : phase === 'active' && canModerate ? (
          <ActiveEventPanel eventId={event.id} triggers={triggers} onRefresh={refresh} canEdit={canModerate} />
        ) : (
          <section className="host-trigger-panel"><div className="panel-heading"><div><span className="eyebrow">{tr('ТРИГГЕРЫ СОБЫТИЯ', 'EVENT TRIGGERS')}</span><h2>{tr('Что уже произошло?', 'What has happened?')}</h2></div><span className="count-badge">{triggers.filter((trigger) => trigger.occurred).length}/{triggers.length}</span></div><div className="trigger-status-list">{triggers.map((trigger) => <div className={`trigger-status-row ${trigger.occurred ? 'trigger-done' : ''}`} key={trigger.id}><span className="trigger-check">{trigger.occurred ? '✓' : '·'}</span><span className="trigger-status-emoji" aria-hidden="true">{trigger.emoji}</span><span>{trigger.label}</span></div>)}</div><p className="field-hint">{tr('Отметки ведущего появятся на карточках участников.', 'Host updates will appear on player cards.')}</p></section>
        )}
        <aside className="participant-panel"><div className="panel-heading"><div><span className="eyebrow">{tr('ЗА СТОЛОМ', 'PLAYERS')}</span><h2>{tr('Игроки', 'Players')}</h2></div><span className="count-badge">{participants.length.toString().padStart(2, '0')}</span></div>{participants.length ? <div className="participant-list">{participants.map((participant, index) => { const isModerator = moderatorIds.includes(participant.user_id); return <div className="participant-row" key={participant.id}><span className="participant-avatar">{participant.display_name.trim().slice(0, 1).toLocaleUpperCase()}</span><span>{participant.display_name}{isModerator && <small className="moderator-badge">{tr('МОДЕРАТОР', 'MODERATOR')}</small>}</span>{isHost ? <button className="moderator-toggle" type="button" onClick={() => void toggleModerator(participant)} aria-pressed={isModerator}>{isModerator ? tr('Снять', 'Remove') : tr('Назначить', 'Make moderator')}</button> : <small>{String(index + 1).padStart(2, '0')}</small>}</div>; })}</div> : <div className="participant-empty">{tr('Пока никого нет. Поделись ссылкой, чтобы открыть набор.', 'No players yet. Share the invite link to open signups.')}</div>}</aside>
      </div>

      {phase === 'finalized' && <section className="leaderboard-section"><div className="participant-board-heading"><div><span className="eyebrow">{tr('ФИНАЛЬНЫЕ РЕЗУЛЬТАТЫ', 'FINAL RESULTS')}</span><h2>{tr('Таблица лидеров', 'Leaderboard')}</h2></div><span className="count-badge">{results.length.toString().padStart(2, '0')}</span></div><Leaderboard results={results} /></section>}

      <footer className="workspace-footer"><span>{tr('ДЕДЛАЙН', 'DEADLINE')} · {formatDate(event.signup_deadline)}</span><Link to="/dashboard">{tr('К МОИМ СОБЫТИЯМ', 'MY EVENTS')} ↑</Link></footer>
    </main>
  );
}
