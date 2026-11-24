import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatError } from '../../lib/errors';
import { tr } from '../../lib/i18n';
import { useAuth } from '../auth/AuthProvider';
import { createGuestNickname, createGuestRecoveryCode } from './guestRecovery';
import { joinEvent, recoverGuestCard, type JoinResult } from './cardApi';

type JoinView = 'loading' | 'join' | 'recover' | 'key' | 'error';

function pendingKeyName(inviteToken: string): string {
  return `bingo:pending-card-key:${inviteToken}`;
}

function savePendingKey(inviteToken: string, code: string): void {
  try { window.localStorage.setItem(pendingKeyName(inviteToken), code); } catch { /* Continue with the in-memory key. */ }
}

function readPendingKey(inviteToken: string): string | null {
  try { return window.localStorage.getItem(pendingKeyName(inviteToken)); } catch { return null; }
}

function clearPendingKey(inviteToken: string): void {
  try { window.localStorage.removeItem(pendingKeyName(inviteToken)); } catch { /* The key is already in memory. */ }
}

function authErrorText(error: unknown): string {
  const candidate = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : null;
  const code = typeof candidate?.code === 'string' ? candidate.code : '';
  const message = typeof candidate?.message === 'string' ? candidate.message.toLowerCase() : '';
  if (code === 'anonymous_provider_disabled' || message.includes('anonymous sign-ins are disabled')) {
    return tr('Гостевой вход пока не включён в Supabase. Ведущий может включить его в настройках Auth или войди через Twitch.', 'Guest access is not enabled in Supabase yet. The project owner can enable it in Auth settings, or you can sign in with Twitch.');
  }
  if (code === 'over_request_rate_limit' || message.includes('rate limit')) {
    return tr('Слишком много гостевых входов за короткое время. Попробуй снова чуть позже.', 'Too many guest sign-ins in a short time. Please try again later.');
  }
  return formatError(error, tr('Не получилось начать гостевой вход.', 'Could not start guest access.'));
}

function eventErrorText(error: unknown): string {
  const message = formatError(error);
  if (/already started|signup.*closed/i.test(message)) return tr('Набор уже закрыт. Если ты уже участвовал, восстанови карточку по секретному ключу.', 'Signups are closed. If you already joined, recover your card with its secret key.');
  if (/recovery code does not match/i.test(message)) return tr('Этот ключ не подходит к событию. Проверь его и попробуй снова.', 'That key does not match this event. Check it and try again.');
  if (/valid guest recovery code is required/i.test(message)) return tr('Не удалось создать ключ восстановления. Попробуй ещё раз.', 'Could not create a recovery key. Please try again.');
  if (/already has a card for this event/i.test(message)) return tr('В этой сессии уже есть другая карточка этого события. Открой восстановление в отдельном браузере или выйди из текущего аккаунта.', 'This session already has another card for this event. Recover it in a separate browser or sign out of the current account.');
  if (/display name must/i.test(message)) return tr('Ник должен содержать от 1 до 32 символов.', 'Nickname must be between 1 and 32 characters.');
  if (/invalid.*invite|invite link/i.test(message)) return tr('Ссылка приглашения недействительна.', 'This invite link is invalid.');
  return message;
}

export default function JoinEventPage() {
  const { inviteToken = '' } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, configured, signInAnonymously } = useAuth();
  const [view, setView] = useState<JoinView>('loading');
  const [event, setEvent] = useState<JoinResult | null>(null);
  const [displayName, setDisplayName] = useState(createGuestNickname);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [savedKeyConfirmed, setSavedKeyConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attemptedUser = useRef('');

  useEffect(() => {
    attemptedUser.current = '';
    setEvent(null);
    setError('');
    setView('loading');
  }, [inviteToken]);

  useEffect(() => {
    if (authLoading || attemptedUser.current === `${inviteToken}:${user?.id ?? 'signed-out'}`) return;
    if (!configured) {
      attemptedUser.current = `${inviteToken}:not-configured`;
      setError(tr('Supabase не настроен для этого проекта.', 'Supabase is not configured for this project.'));
      setView('error');
      return;
    }
    if (!user) {
      attemptedUser.current = `${inviteToken}:signing-in`;
      setView('loading');
      void signInAnonymously().catch((cause) => {
        attemptedUser.current = `${inviteToken}:sign-in-failed`;
        setError(authErrorText(cause));
        setView('error');
      });
      return;
    }

    attemptedUser.current = `${inviteToken}:${user.id}`;
    let active = true;
    setBusy(true);
    setView('loading');
    void joinEvent(inviteToken).then((result) => {
      if (!active) return;
      setEvent(result);
      if (result.isHost) navigate(`/host/${result.eventId}`, { replace: true });
      else if (result.participantId) {
        const pendingKey = user.is_anonymous ? readPendingKey(inviteToken) : null;
        if (pendingKey) {
          setRecoveryCode(pendingKey);
          setSavedKeyConfirmed(false);
          setView('key');
        } else navigate(`/play/${result.eventId}`, { replace: true });
      }
      else if (user.is_anonymous) setView('join');
      else {
        setError(tr('Не удалось определить Twitch-ник. Выйди и войди через Twitch ещё раз.', 'Could not identify your Twitch username. Sign out and sign in with Twitch again.'));
        setView('error');
      }
    }).catch((cause) => {
      if (active) {
        setError(eventErrorText(cause));
        setView('error');
      }
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [authLoading, configured, inviteToken, navigate, signInAnonymously, user]);

  async function submitJoin(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!event || !user?.is_anonymous || !event.signupOpen) return;
    setBusy(true);
    setError('');
    const newCode = createGuestRecoveryCode();
    try {
      const result = await joinEvent(inviteToken, displayName, newCode);
      if (!result.participantId) throw new Error(tr('Не удалось создать карточку игрока.', 'Could not create your player card.'));
      savePendingKey(inviteToken, newCode);
      setEvent(result);
      setRecoveryCode(newCode);
      setSavedKeyConfirmed(false);
      setCopied(false);
      setCopyError(false);
      setView('key');
    } catch (cause) {
      setError(eventErrorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitRecovery(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!event) return;
    setBusy(true);
    setError('');
    const replacementCode = createGuestRecoveryCode();
    try {
      const result = await recoverGuestCard(inviteToken, recoveryInput.trim().toUpperCase(), replacementCode);
      if (!result.participantId) throw new Error(tr('Карточка не найдена.', 'Card not found.'));
      savePendingKey(inviteToken, replacementCode);
      setEvent(result);
      setRecoveryCode(replacementCode);
      setSavedKeyConfirmed(false);
      setCopied(false);
      setCopyError(false);
      setView('key');
    } catch (cause) {
      setError(eventErrorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function copyRecoveryCode() {
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
      setCopied(false);
    }
  }

  function continueToCard() {
    if (event?.eventId && event.participantId) {
      clearPendingKey(inviteToken);
      navigate(`/play/${event.eventId}`, { replace: true });
    }
  }

  return (
    <main className="workspace-page">
      <header className="workspace-topbar"><Link className="brand" to="/" aria-label={tr('Бинго — на главную', 'Bingo — home')}><span className="brand-mark">{tr('Б', 'B')}</span><span>BINGO<span className="brand-period">.</span></span></Link><span className="eyebrow">{tr('ПРИГЛАШЕНИЕ В ИГРУ', 'BINGO INVITATION')}</span></header>
      <section className="join-card">
        {view === 'loading' ? <div className="loading-panel">{tr('Подключаемся к событию', 'Connecting to the event')}<span className="loading-dots">•••</span></div> : null}

        {view === 'join' && event && <>
          <span className="eyebrow">{tr(event.signupOpen ? 'ПРИСОЕДИНИТЬСЯ К ИГРЕ' : 'НАБОР ЗАКРЫТ', event.signupOpen ? 'JOIN THE GAME' : 'SIGNUPS CLOSED')}</span>
          <h1>{event.title}</h1>
          <p className="join-meta">{event.gridSize} × {event.gridSize} · {tr('по приглашению', 'invite only')}</p>
          <p className="join-copy">{event.signupOpen ? tr('Введи ник, который увидят ведущий и другие игроки.', 'Choose the nickname the host and other players will see.') : tr('Событие уже началось. Если ты уже присоединился с другого браузера, восстанови карточку по ключу.', 'The game has started. If you already joined in another browser, recover your card with its key.')}</p>
          <form className="guest-join-form" onSubmit={(formEvent) => void submitJoin(formEvent)}>
            <label className="field-label" htmlFor="guest-display-name">{tr('Твой ник', 'Your nickname')}</label>
            <input id="guest-display-name" className="text-input" type="text" autoComplete="nickname" maxLength={32} value={displayName} onChange={(inputEvent) => setDisplayName(inputEvent.target.value)} required disabled={!event.signupOpen || busy} />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary" type="submit" disabled={!event.signupOpen || busy}>{busy ? tr('Присоединяемся…', 'Joining…') : tr('Войти в событие', 'Join event')} <span aria-hidden="true">↗</span></button>
          </form>
          <button className="text-link guest-recover-link" type="button" onClick={() => { setError(''); setRecoveryInput(readPendingKey(inviteToken) ?? ''); setView('recover'); }}>{tr('Уже есть карточка? Восстановить по ключу', 'Already have a card? Recover with a key')}</button>
        </>}

        {view === 'recover' && event && <>
          <span className="eyebrow">{tr('ВОССТАНОВЛЕНИЕ КАРТОЧКИ', 'CARD RECOVERY')}</span>
          <h1>{tr('Введи', 'Enter your')}<br /><span>{tr('секретный ключ.', 'secret key.')}</span></h1>
          <p className="join-copy">{tr(`Ключ восстановит карточку события «${event.title}». После восстановления появится новый ключ — старый перестанет работать.`, `This key restores your card for “${event.title}”. We’ll give you a new key afterward; the old one will stop working.`)}</p>
          <form className="guest-join-form" onSubmit={(formEvent) => void submitRecovery(formEvent)}>
            <label className="field-label" htmlFor="guest-recovery-code">{tr('Ключ восстановления', 'Recovery key')}</label>
            <input id="guest-recovery-code" className="text-input guest-recovery-input" type="text" autoComplete="off" spellCheck={false} autoCapitalize="characters" maxLength={14} placeholder="ABCD-EFGH-JKMP" value={recoveryInput} onChange={(inputEvent) => setRecoveryInput(inputEvent.target.value.toUpperCase())} required disabled={busy} />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? tr('Восстанавливаем…', 'Recovering…') : tr('Восстановить карточку', 'Recover card')} <span aria-hidden="true">↗</span></button>
          </form>
          <button className="text-link guest-recover-link" type="button" onClick={() => { setError(''); setView('join'); }}>{tr('← Назад к присоединению', '← Back to joining')}</button>
        </>}

        {view === 'key' && <>
          <span className="eyebrow">{tr('СОХРАНИ КЛЮЧ КАРТОЧКИ', 'SAVE YOUR CARD KEY')}</span>
          <h1>{tr('Ты в игре.', 'You’re in.')}</h1>
          <p className="join-copy">{tr('Сохрани ключ, чтобы вернуть эту карточку в другом браузере. Покажем его только сейчас. Он работает только для этого события.', 'Save this key to restore this card in another browser. It is shown only now and works only for this event.')}</p>
          <div className="guest-recovery-code" aria-label={tr('Секретный ключ восстановления', 'Secret recovery key')}>{recoveryCode}</div>
          <button type="button" className="button button-outline guest-copy-key" onClick={() => void copyRecoveryCode()}>{copied ? tr('Скопировано ✓', 'Copied ✓') : tr('Скопировать ключ', 'Copy key')}</button>
          {copyError && <p className="field-hint" role="status">{tr('Не удалось скопировать автоматически — выдели ключ и скопируй вручную.', 'Could not copy automatically. Select and copy the key manually.')}</p>}
          <label className="guest-key-confirm"><input type="checkbox" checked={savedKeyConfirmed} onChange={(inputEvent) => setSavedKeyConfirmed(inputEvent.target.checked)} /><span>{tr('Я сохранил(а) ключ', 'I saved the key')}</span></label>
          <button type="button" className="button button-primary" onClick={continueToCard} disabled={!savedKeyConfirmed}>{tr('Продолжить к карточке', 'Continue to card')} <span aria-hidden="true">↗</span></button>
        </>}

        {view === 'error' && <>
          <span className="eyebrow">{tr('НЕ УДАЛОСЬ ПРИСОЕДИНИТЬСЯ', 'COULD NOT JOIN')}</span>
          <h1>{tr('Не удалось', 'Could not')}<br /><span>{tr('войти в игру.', 'join the game.')}</span></h1>
          <p className="join-copy" role="alert">{error || tr('Проверь ссылку и попробуй снова.', 'Check the invite link and try again.')}</p>
          <div className="guest-join-actions"><Link className="button button-outline" to="/login">{tr('Войти через Twitch', 'Sign in with Twitch')} <span>↗</span></Link><Link className="text-link" to="/">{tr('На главную', 'Home')}</Link></div>
        </>}
      </section>
      <footer className="workspace-footer"><span>{tr('НИК НЕ ПРОВЕРЯЕТСЯ · КЛЮЧ СОХРАНЯЕТ КАРТОЧКУ', 'NICKNAMES ARE UNVERIFIED · KEY PROTECTS YOUR CARD')}</span><Link to="/">{tr('НА ГЛАВНУЮ', 'HOME')} ↑</Link></footer>
    </main>
  );
}
