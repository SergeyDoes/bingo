import { useEffect, useState, type FormEvent } from 'react';
import { formatError } from '../../lib/errors';
import EmojiPicker from './EmojiPicker';
import { DEFAULT_EVENT_EMOJI, DEFAULT_TRIGGER_EMOJI } from './emojiOptions';
import { validateEventDraft, type EventDraft, type TriggerDraft } from './eventValidation';
import { tr } from '../../lib/i18n';

interface CreateEventFormProps {
  initial?: Partial<EventDraft>;
  mode?: 'create' | 'edit';
  allowGridSize?: boolean;
  submitLabel: string;
  onSubmit: (draft: EventDraft) => Promise<void>;
  onDraftChange?: (draft: EventDraft) => void;
  onCancel?: () => void;
}

export function toLocalInputValue(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function emptyTriggers(): TriggerDraft[] {
  return Array.from({ length: 9 }, () => ({ label: '', emoji: DEFAULT_TRIGGER_EMOJI }));
}

export default function CreateEventForm({ initial, mode = initial ? 'edit' : 'create', allowGridSize = true, submitLabel, onSubmit, onDraftChange, onCancel }: CreateEventFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [eventEmoji, setEventEmoji] = useState(initial?.emoji ?? DEFAULT_EVENT_EMOJI);
  const [gridSize, setGridSize] = useState(initial?.gridSize ?? 3);
  const [deadline, setDeadline] = useState(initial?.signupDeadline ?? toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? false);
  const [triggers, setTriggers] = useState<TriggerDraft[]>(initial?.triggers?.length ? initial.triggers.map((trigger) => ({ ...trigger })) : emptyTriggers());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draggingTriggerIndex, setDraggingTriggerIndex] = useState<number | null>(null);
  const minimum = Math.max(5, gridSize * gridSize);
  const filledCount = triggers.filter((trigger) => trigger.label.trim()).length;
  const [deadlineDate, deadlineTime = ''] = deadline.split('T');

  useEffect(() => {
    onDraftChange?.({
      title,
      emoji: eventEmoji,
      gridSize,
      signupDeadline: deadline,
      isPublic,
      triggers: triggers.map((trigger) => ({ ...trigger })),
    });
  }, [title, eventEmoji, gridSize, deadline, isPublic, triggers, onDraftChange]);

  function updateTrigger(index: number, changes: Partial<TriggerDraft>) {
    setTriggers((current) => current.map((trigger, triggerIndex) => triggerIndex === index ? { ...trigger, ...changes } : trigger));
  }

  function updateDeadline(date: string, time: string) {
    setDeadline(`${date}T${time}`);
  }

  function moveTrigger(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= triggers.length || to >= triggers.length) return;
    setTriggers((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
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
        <div><span className="eyebrow">{tr('ПАРАМЕТРЫ СОБЫТИЯ', 'EVENT SETTINGS')}</span><h2>{mode === 'edit' ? tr('Настройки события', 'Event settings') : tr('Новое бинго', 'New bingo')}</h2></div>
        <span className="form-spark" aria-hidden="true">{eventEmoji}</span>
      </div>

      <div className="event-title-row">
        <div className="form-field">
          <label className="field-label" htmlFor="event-title">{tr('Название события', 'Event name')}</label>
          <input id="event-title" className="text-input" maxLength={80} placeholder={tr('Например, финал сезона', 'e.g. Season finale')} value={title} onChange={(event) => setTitle(event.target.value)} required />
        </div>
        <div className="form-field event-emoji-field">
          <label className="field-label" htmlFor="event-emoji">{tr('Значок', 'Icon')}</label>
          <EmojiPicker value={eventEmoji} label={tr('Значок события', 'Event icon')} variant="event" onChange={setEventEmoji} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label className="field-label" htmlFor="event-size">{tr('Карточка', 'Card')}</label>
          <select id="event-size" className="text-input" value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))} disabled={!allowGridSize}>
            {[2, 3, 4, 5, 6, 7].map((size) => <option value={size} key={size}>{size} × {size}{size === 2 ? tr(' · тест', ' · test') : ''}</option>)}
          </select>
          {!allowGridSize && <small className="field-hint">{tr('Размер карточки фиксируется при создании.', 'Card size is fixed when the event is created.')}</small>}
        </div>
        <div className="form-field">
          <span className="field-label">{tr('Дедлайн и старт', 'Deadline and start')}</span>
          <div className="deadline-fields">
            <label className="deadline-part" htmlFor="event-deadline-date">{tr('Дата', 'Date')}<input id="event-deadline-date" className="text-input" type="date" value={deadlineDate} onChange={(event) => updateDeadline(event.target.value, deadlineTime)} required /></label>
            <label className="deadline-part" htmlFor="event-deadline-time">{tr('Время · 24 ч', 'Time · 24h')}<input id="event-deadline-time" className="text-input deadline-time-input" type="text" inputMode="text" placeholder="HH:MM" pattern="([01][0-9]|2[0-3]):[0-5][0-9]" maxLength={5} value={deadlineTime} onChange={(event) => updateDeadline(deadlineDate, event.target.value)} required aria-describedby="event-deadline-hint" /></label>
          </div>
          <small className="field-hint" id="event-deadline-hint">{tr('Введи время в формате 24 часов, например 18:30. По дедлайну карточки заблокируются и игра начнётся.', 'Enter time in 24-hour format, e.g. 18:30. Cards lock and the game starts at the deadline.')}</small>
        </div>
      </div>

      <label className="public-event-toggle">
        <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
        <span className="public-event-check" aria-hidden="true">✓</span>
        <span><strong>{tr('Публичное событие', 'Public event')}</strong><small>{tr('Показывать игрокам в общем списке, пока открыт набор.', 'Show in the public event list while signups are open.')}</small></span>
      </label>

      <div className="trigger-field-heading"><span className="field-label">{tr('Триггеры', 'Triggers')}</span><span>{filledCount} / {minimum}</span></div>
      <div className="trigger-editor-list">
        {triggers.map((trigger, index) => <div className="trigger-editor-row" key={index}>
          <span className="trigger-editor-number">{String(index + 1).padStart(2, '0')}</span>
          <EmojiPicker value={trigger.emoji} label={`${tr('Значок триггера', 'Trigger icon')} ${index + 1}`} onChange={(emoji) => updateTrigger(index, { emoji })} />
          <input className="text-input trigger-name-input" maxLength={120} placeholder={`${tr('Название триггера', 'Trigger name')} ${index + 1}`} value={trigger.label} onChange={(event) => updateTrigger(index, { label: event.target.value })} aria-label={`${tr('Название триггера', 'Trigger name')} ${index + 1}`} />
          <button type="button" className="remove-trigger-button" onClick={() => setTriggers((current) => current.filter((_, rowIndex) => rowIndex !== index))} aria-label={`${tr('Удалить триггер', 'Remove trigger')} ${index + 1}`}>×</button>
        </div>)}
      </div>
      <details className="trigger-order-details">
        <summary>{tr('Детали · порядок триггеров', 'Details · trigger order')}</summary>
        <p className="field-hint">{tr('Перетащи триггеры или используй стрелки. Этот порядок увидят игроки при сборке карточки.', 'Drag triggers or use the arrows to reorder them. Players will see this order when building their cards.')}</p>
        <ol className="trigger-order-list">
          {triggers.map((trigger, index) => <li
            className={`trigger-order-item${draggingTriggerIndex === index ? ' trigger-order-item-dragging' : ''}`}
            key={`${trigger.label}-${index}`}
            draggable
            onDragStart={(event) => { setDraggingTriggerIndex(index); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(index)); }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); moveTrigger(from, index); setDraggingTriggerIndex(null); }}
            onDragEnd={() => setDraggingTriggerIndex(null)}
          >
            <span className="trigger-order-handle" aria-hidden="true">⠿</span><span className="trigger-order-emoji" aria-hidden="true">{trigger.emoji}</span><span className="trigger-order-name">{trigger.label || `${tr('Триггер', 'Trigger')} ${index + 1}`}</span>
            <div className="trigger-order-buttons"><button type="button" aria-label={`${tr('Поднять триггер', 'Move trigger up')} ${index + 1}`} disabled={index === 0} onClick={() => moveTrigger(index, index - 1)}>↑</button><button type="button" aria-label={`${tr('Опустить триггер', 'Move trigger down')} ${index + 1}`} disabled={index === triggers.length - 1} onClick={() => moveTrigger(index, index + 1)}>↓</button></div>
          </li>)}
        </ol>
      </details>
      <button className="add-trigger-button" type="button" onClick={() => setTriggers((current) => [...current, { label: '', emoji: DEFAULT_TRIGGER_EMOJI }])}>+ {tr('Добавить триггер', 'Add trigger')}</button>
      <small className="field-hint">{tr('Добавь хотя бы', 'Add at least')} {minimum} {tr('разных вариантов — игроки сами соберут из них карточки.', 'different options so players can build their own cards.')}</small>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        {onCancel && <button className="button button-outline" type="button" onClick={onCancel}>{tr('Отмена', 'Cancel')}</button>}
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? tr('Сохраняем…', 'Saving…') : submitLabel === 'Создать бинго' ? tr('Создать бинго', 'Create bingo') : submitLabel === 'Сохранить изменения' ? tr('Сохранить изменения', 'Save changes') : submitLabel} <span aria-hidden="true">↗</span></button>
      </div>
    </form>
  );
}
