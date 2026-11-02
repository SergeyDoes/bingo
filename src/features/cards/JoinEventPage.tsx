import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { JoinResult } from './cardApi';
import { joinEvent } from './cardApi';
import { formatError } from '../../lib/errors';

function formatDate(date: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

export default function JoinEventPage() {
  const { inviteToken = '' } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<JoinResult | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    void joinEvent(inviteToken).then((result) => {
      if (!active) return;
      if (result.isHost) {
        navigate(`/host/${result.eventId}`, { replace: true });
      } else if (result.participantId) {
        navigate(`/play/${result.eventId}`, { replace: true });
      } else {
        setInvite(result);
      }
    }).catch((cause) => {
      if (active) setError(formatError(cause, 'Эта ссылка недействительна или набор уже закрыт.'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [inviteToken, navigate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setJoining(true);
    try {
      const result = await joinEvent(inviteToken, displayName);
      if (result.isHost) navigate(`/host/${result.eventId}`, { replace: true });
      else navigate(`/play/${result.eventId}`, { replace: true });
    } catch (cause) {
      setError(formatError(cause, 'Не получилось присоединиться к событию.'));
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="workspace-page">
      <header className="workspace-topbar"><Link className="brand" to="/" aria-label="Бинго — на главную"><span className="brand-mark">Б</span><span>БИНГО<span className="brand-period">.</span></span></Link><span className="eyebrow">ПРИГЛАШЕНИЕ В ИГРУ</span></header>
      <section className="join-card">
        {loading ? <div className="loading-panel">Проверяем приглашение<span className="loading-dots">•••</span></div> : invite ? (
          <>
            <span className="eyebrow"><span className="live-dot" /> ТЕБЯ ЖДУТ ЗА ИГРОВЫМ СТОЛОМ</span>
            <h1>{invite.title}</h1>
            <p className="join-meta">Карточка {invite.gridSize} × {invite.gridSize} <i>·</i> старт {formatDate(invite.signupDeadline)}</p>
            <p className="join-copy">Введи имя, под которым тебя будут видеть друзья, и собери свою карточку из общих триггеров.</p>
            <form className="login-form join-form" onSubmit={submit}>
              <label htmlFor="display-name">Имя в игре</label>
              <input id="display-name" autoComplete="nickname" maxLength={32} placeholder="Как тебя звать за столом?" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button button-primary" type="submit" disabled={joining}>{joining ? 'Заходим…' : 'Присоединиться'} <span aria-hidden="true">↗</span></button>
            </form>
          </>
        ) : (
          <>
            <span className="eyebrow">ПРИГЛАШЕНИЕ НЕ НАЙДЕНО</span>
            <h1>Похоже,<br /><span>игра уже началась.</span></h1>
            <p className="join-copy">{error || 'Попроси ведущего прислать актуальную ссылку.'}</p>
            <Link className="button button-outline" to="/">На главную <span>↗</span></Link>
          </>
        )}
      </section>
      <footer className="workspace-footer"><span>ТВОЁ ИМЯ В ИГРЕ ВИДНО УЧАСТНИКАМ ЭТОГО СОБЫТИЯ</span><Link to="/">НА ГЛАВНУЮ ↑</Link></footer>
    </main>
  );
}
