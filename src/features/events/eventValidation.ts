import { EVENT_EMOJI_OPTIONS } from './emojiOptions';
import { tr } from '../../lib/i18n';

export interface TriggerDraft {
  label: string;
  emoji: string;
}

export interface EventDraft {
  title: string;
  emoji: string;
  gridSize: number;
  signupDeadline: string;
  isPublic: boolean;
  triggers: TriggerDraft[];
}

export function validateEventDraft(draft: EventDraft, now = new Date()): string | null {
  if (!draft.title.trim() || draft.title.trim().length > 80) {
    return tr('Название события должно содержать от 1 до 80 символов.', 'Event name must be between 1 and 80 characters.');
  }
  if (!EVENT_EMOJI_OPTIONS.includes(draft.emoji as typeof EVENT_EMOJI_OPTIONS[number])) {
    return tr('Выбери значок события из списка.', 'Choose an event icon from the list.');
  }
  if (!Number.isInteger(draft.gridSize) || draft.gridSize < 2 || draft.gridSize > 7) {
    return tr('Размер карточки должен быть от 2 × 2 до 7 × 7.', 'Card size must be between 2 × 2 and 7 × 7.');
  }

  const deadline = new Date(draft.signupDeadline);
  if (Number.isNaN(deadline.getTime()) || deadline <= now) {
    return tr('Дедлайн должен быть в будущем.', 'The deadline must be in the future.');
  }

  const minimum = Math.max(5, draft.gridSize * draft.gridSize);
  const triggers = draft.triggers.filter((trigger) => trigger.label.trim());
  if (triggers.length < minimum) {
    return tr(`Для карточки ${draft.gridSize} × ${draft.gridSize} добавь хотя бы ${minimum} триггеров.`, `Add at least ${minimum} triggers for a ${draft.gridSize} × ${draft.gridSize} card.`);
  }
  if (triggers.some((trigger) => trigger.label.trim().length > 120)) {
    return tr('Каждый триггер должен быть короче 120 символов.', 'Each trigger must be 120 characters or fewer.');
  }

  if (triggers.some((trigger) => !EVENT_EMOJI_OPTIONS.includes(trigger.emoji as typeof EVENT_EMOJI_OPTIONS[number]))) {
    return tr('Выбери значок для каждого триггера.', 'Choose an icon for each trigger.');
  }

  const normalized = triggers.map((trigger) => trigger.label.trim().toLocaleLowerCase('ru-RU'));
  if (normalized.some((label) => !label) || new Set(normalized).size !== normalized.length) {
    return tr('Убери пустые и повторяющиеся триггеры.', 'Remove empty or duplicate triggers.');
  }

  return null;
}
