import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { joinEvent } from './cardApi';
import { formatError } from '../../lib/errors';

export default function JoinEventPage() {
  const { inviteToken = '' } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
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
        setError('Не удалось определить Twitch-ник. Выйди и войди через Twitch ещё раз.');
      }
    }).catch((cause) => {
      if (active) setError(formatError(cause, 'Эта ссылка недействительна или набор уже закрыт.'));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [inviteToken, navigate]);

  return (
    <main className="workspace-page">
      <header className="workspace-topbar"><Link className="brand" to="/" aria-label="Бинго — на главную"><span className="brand-mark">Б</span><span>БИНГО<span className="brand-period">.</span></span></Link><span className="eyebrow">ПРИГЛАШЕНИЕ В ИГРУ</span></header>
      <section className="join-card">
        {loading ? <div className="loading-panel">Входим в бинго под Twitch-ником<span className="loading-dots">•••</span></div> : (
          <>
            <span className="eyebrow">НЕ ПОЛУЧИЛОСЬ ВОЙТИ</span>
            <h1>Не удалось<br /><span>присоединиться.</span></h1>
            <p className="join-copy">{error || 'Проверь ссылку и попробуй снова.'}</p>
            <Link className="button button-outline" to="/dashboard">К событиям <span>↗</span></Link>
          </>
        )}
      </section>
      <footer className="workspace-footer"><span>В ИГРЕ ИСПОЛЬЗУЕТСЯ ТВОЙ TWITCH-НИК</span><Link to="/">НА ГЛАВНУЮ ↑</Link></footer>
    </main>
  );
}
