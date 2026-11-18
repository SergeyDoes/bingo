import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { formatError } from '../../lib/errors';
import { requireSupabase } from '../../lib/supabase';
import CardDraftPreview from './CardDraftPreview';
import CreateEventForm, { toLocalInputValue } from './CreateEventForm';
import { createEvent } from './eventApi';
import type { EventDraft } from './eventValidation';
import { DEFAULT_EVENT_EMOJI, DEFAULT_TRIGGER_EMOJI } from './emojiOptions';

const emptyDraft = (): EventDraft => ({
  title: '', emoji: DEFAULT_EVENT_EMOJI, gridSize: 3,
  signupDeadline: toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  isPublic: false,
  triggers: Array.from({ length: 9 }, () => ({ label: '', emoji: DEFAULT_TRIGGER_EMOJI })),
});

export default function CreateEventPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const copyDraft = (location.state as { copyDraft?: EventDraft } | null)?.copyDraft;
  const [draft, setDraft] = useState<EventDraft>(() => copyDraft ?? emptyDraft());
  const [canCreate, setCanCreate] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void requireSupabase().rpc('is_bingo_host_authorized').then(({ data, error: rpcError }) => {
      if (!active) return;
      if (rpcError) { setError(formatError(rpcError)); setCanCreate(false); }
      else setCanCreate(data);
    });
    return () => { active = false; };
  }, []);

  async function submit(input: EventDraft) {
    const created = await createEvent(input);
    navigate(`/host/${created.eventId}`);
  }

  return <main className="workspace-page">
    <header className="workspace-topbar"><Link className="brand" to="/" aria-label="На главную"><span className="brand-mark">Б</span><span>БИНГО<span className="brand-period">.</span></span></Link><Link className="quiet-link" to="/dashboard">← К СПИСКУ СОБЫТИЙ</Link></header>
    <section className="create-page-heading"><span className="eyebrow">{copyDraft ? 'КОПИЯ · НОВОЕ СОБЫТИЕ' : 'НОВОЕ СОБЫТИЕ'} · {String(user?.user_metadata?.name || 'TWITCH')}</span><h1>Новое<br /><span>бинго.</span></h1></section>
    {canCreate === null ? <div className="loading-panel">Проверяем право ведущего<span className="loading-dots">•••</span></div> : canCreate ? <div className="create-event-workspace"><section className="create-event-form-panel"><CreateEventForm key={location.key} mode="create" initial={copyDraft} submitLabel="Создать бинго" onSubmit={submit} onDraftChange={setDraft} /></section><CardDraftPreview gridSize={draft.gridSize} triggers={draft.triggers} /></div> : <section className="not-found-card"><span className="eyebrow">ДОСТУП ВЕДУЩЕГО</span><h2>Пока нельзя создавать бинго.</h2><p>{error || 'Попроси владельца сервиса добавить твой Twitch-ник в список ведущих.'}</p><Link className="button button-outline" to="/dashboard">В меню событий</Link></section>}
  </main>;
}
