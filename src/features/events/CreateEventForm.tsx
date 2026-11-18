import { useState, type FormEvent } from 'react';
import { formatError } from '../../lib/errors';
import EmojiPicker from './EmojiPicker';
import { DEFAULT_EVENT_EMOJI, DEFAULT_TRIGGER_EMOJI } from './emojiOptions';
import { validateEventDraft, type EventDraft, type TriggerDraft } from './eventValidation';

interface CreateEventFormProps {
  initial?: Partial<EventDraft>;
  allowGridSize?: boolean;
  submitLabel: string;
  onSubmit: (draft: EventDraft) => Promise<void>;
  onCancel?: () => void;
}

export function toLocalInputValue(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function emptyTriggers(): TriggerDraft[] {
  return Array.from({ length: 9 }, () => ({ label: '', emoji: DEFAULT_TRIGGER_EMOJI }));
}

export default function CreateEventForm({ initial, allowGridSize = true, submitLabel, onSubmit, onCancel }: CreateEventFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [eventEmoji, setEventEmoji] = useState(initial?.emoji ?? DEFAULT_EVENT_EMOJI);
  const [gridSize, setGridSize] = useState(initial?.gridSize ?? 3);
  const [deadline, setDeadline] = useState(initial?.signupDeadline ?? toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? false);
  const [triggers, setTriggers] = useState<TriggerDraft[]>(initial?.triggers?.length ? initial.triggers.map((trigger) => ({ ...trigger })) : emptyTriggers());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const minimum = Math.max(5, gridSize * gridSize);
  const filledCount = triggers.filter((trigger) => trigger.label.trim()).length;

  function updateTrigger(index: number, changes: Partial<TriggerDraft>) {
    setTriggers((current) => current.map((trigger, triggerIndex) => triggerIndex === index ? { ...trigger, ...changes } : trigger));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft: EventDraft = {
      title,
      emoji: eventEmoji,
      gridSize,
      signupDeadline: deadline,
      isPublic,
      triggers: triggers.filter((trigger) => trigger.label.trim()).map((trigger) => ({ ...trigger, label: trigger.label.trim() })),
    };
    const validationError = validateEventDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError('');
    try {
      await onSubmit(draft);
    } catch (cause) {
      setError(formatError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="event-form" onSubmit={submit}>
      <div className="form-heading">
        <div><span className="eyebrow">СОБЕРИ СВОЁ ПОЛЕ</span><h2>{initial ? 'Настройки события' : 'Новое бинго'}</h2></div>
        <span className="form-spark" aria-hidden="true">{eventEmoji}</span>
      </div>

      <div className="event-title-row">
        <div className="form-field">
          <label className="field-label" htmlFor="event-title">Название события</label>
          <input id="event-title" className="text-input" maxLength={80} placeholder="Например, финал сезона" value={title} onChange={(event) => setTitle(event.target.value)} required />
        </div>
        <div className="form-field event-emoji-field">
          <label className="field-label" htmlFor="event-emoji">Значок</label>
          <EmojiPicker value={eventEmoji} label="Значок события" variant="event" onChange={setEventEmoji} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor="event-size">Карточка</label>
          <select id="event-size" className="text-input" value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))} disabled={!allowGridSize}>
            {[2, 3, 4, 5, 6, 7].map((size) => <option value={size} key={size}>{size} × {size}{size === 2 ? ' · тест' : ''}</option>)}
          </select>
          {!allowGridSize && <small className="field-hint">Размер карточки фиксируется при создании.</small>}
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor="event-deadline">Дедлайн и старт</label>
          <input id="event-deadline" className="text-input" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} required />
          <small className="field-hint">По дедлайну карточки заблокируются, и игра начнётся.</small>
        </div>
      </div>

      <label className="public-event-toggle">
        <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
        <span className="public-event-check" aria-hidden="true">✓</span>
        <span><strong>Публичное событие</strong><small>Показывать игрокам в общем списке, пока открыт набор.</small></span>
      </label>

      <div className="trigger-field-heading"><span className="field-label">Триггеры</span><span>{filledCount} / {minimum}</span></div>
      <div className="trigger-editor-list">
        {triggers.map((trigger, index) => <div className="trigger-editor-row" key={index}>
          <span className="trigger-editor-number">{String(index + 1).padStart(2, '0')}</span>
          <EmojiPicker value={trigger.emoji} label={`Значок триггера ${index + 1}`} onChange={(emoji) => updateTrigger(index, { emoji })} />
          <input className="text-input trigger-name-input" maxLength={120} placeholder={`Название триггера ${index + 1}`} value={trigger.label} onChange={(event) => updateTrigger(index, { label: event.target.value })} aria-label={`Название триггера ${index + 1}`} />
          <button type="button" className="remove-trigger-button" onClick={() => setTriggers((current) => current.filter((_, rowIndex) => rowIndex !== index))} aria-label={`Удалить триггер ${index + 1}`}>×</button>
        </div>)}
      </div>
      <button className="add-trigger-button" type="button" onClick={() => setTriggers((current) => [...current, { label: '', emoji: DEFAULT_TRIGGER_EMOJI }])}>+ Добавить триггер</button>
      <small className="field-hint">Добавь хотя бы {minimum} разных вариантов — игроки сами соберут из них карточки.</small>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        {onCancel && <button className="button button-outline" type="button" onClick={onCancel}>Отмена</button>}
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Сохраняем…' : submitLabel} <span aria-hidden="true">↗</span></button>
      </div>
    </form>
  );
}
