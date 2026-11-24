import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { formatError } from '../../lib/errors';
import { requireSupabase } from '../../lib/supabase';
import CardDraftPreview from './CardDraftPreview';
import { tr } from '../../lib/i18n';
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
    <header className="workspace-topbar"><Link className="brand" to="/" aria-label={tr('На главную', 'Home')}><span className="brand-mark">Б</span><span>BINGO<span className="brand-period">.</span></span></Link><Link className="quiet-link" to="/dashboard">← {tr('К СПИСКУ СОБЫТИЙ', 'BACK TO EVENTS')}</Link></header>
    <section className="create-page-heading"><span className="eyebrow">{copyDraft ? tr('КОПИЯ · НОВОЕ СОБЫТИЕ', 'COPY · NEW EVENT') : tr('НОВОЕ СОБЫТИЕ', 'NEW EVENT')} · {String(user?.user_metadata?.name || 'TWITCH')}</span><h1>{tr('Новое', 'New')}<br /><span>{tr('бинго.', 'bingo.')}</span></h1></section>
    {canCreate === null ? <div className="loading-panel">{tr('Проверяем право ведущего', 'Checking host permissions')}<span className="loading-dots">•••</span></div> : canCreate ? <div className="create-event-workspace"><section className="create-event-form-panel"><CreateEventForm key={location.key} mode="create" initial={copyDraft} submitLabel="Создать бинго" onSubmit={submit} onDraftChange={setDraft} /></section><CardDraftPreview gridSize={draft.gridSize} triggers={draft.triggers} /></div> : <section className="not-found-card"><span className="eyebrow">{tr('ДОСТУП ВЕДУЩЕГО', 'HOST ACCESS')}</span><h2>{tr('Пока нельзя создавать бинго.', 'You cannot create bingo events yet.')}</h2><p>{error || tr('Попроси владельца сервиса добавить твой Twitch-ник в список ведущих.', 'Ask the service owner to add your Twitch username to the host list.')}</p><Link className="button button-outline" to="/dashboard">{tr('В меню событий', 'Back to events')}</Link></section>}
  </main>;
}
