import { useEffect, useState } from 'react';
import type { EventTriggerRow } from '../../lib/database.types';
import { formatError } from '../../lib/errors';
import { requireSupabase } from '../../lib/supabase';
import { setTriggerOccurred } from './eventApi';

interface ActiveEventPanelProps {
  eventId: string;
  triggers: EventTriggerRow[];
  onRefresh: () => Promise<void>;
}

export default function ActiveEventPanel({ eventId, triggers, onRefresh }: ActiveEventPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const client = requireSupabase();
    const channel = client.channel(`event-triggers-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_triggers', filter: `event_id=eq.${eventId}` }, () => {
        void onRefresh();
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [eventId, onRefresh]);

  async function toggle(trigger: EventTriggerRow) {
    setBusyId(trigger.id);
    setError('');
    try {
      await setTriggerOccurred(eventId, trigger.id, !trigger.occurred);
      await onRefresh();
    } catch (cause) {
      setError(formatError(cause, 'Не получилось обновить триггер.'));
    } finally {
      setBusyId(null);
    }
  }

  const occurredCount = triggers.filter((trigger) => trigger.occurred).length;

  return (
    <section className="host-trigger-panel">
      <div className="panel-heading"><div><span className="eyebrow">ОТМЕЧАЙ ПО ХОДУ ИГРЫ</span><h2>Что уже произошло?</h2></div><span className="count-badge">{occurredCount}/{triggers.length}</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="active-trigger-list">{triggers.map((trigger, index) => <button type="button" className={`active-trigger-row ${trigger.occurred ? 'trigger-done' : ''}`} key={trigger.id} onClick={() => void toggle(trigger)} disabled={busyId !== null} aria-pressed={trigger.occurred}>
        <span className="trigger-check">{trigger.occurred ? '✓' : String(index + 1).padStart(2, '0')}</span><span className="active-trigger-emoji" aria-hidden="true">{trigger.emoji}</span><span>{trigger.label}</span><small>{busyId === trigger.id ? '...' : trigger.occurred ? 'СБЫЛОСЬ' : 'ОТМЕТИТЬ'}</small>
      </button>)}</div>
      <p className="field-hint">Изменения появляются на карточках игроков автоматически.</p>
    </section>
  );
}
