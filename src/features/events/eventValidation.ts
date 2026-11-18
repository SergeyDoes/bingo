import { EVENT_EMOJI_OPTIONS } from './emojiOptions';

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
    return 'Название события должно содержать от 1 до 80 символов.';
  }
  if (!EVENT_EMOJI_OPTIONS.includes(draft.emoji as typeof EVENT_EMOJI_OPTIONS[number])) {
    return 'Выбери значок события из списка.';
  }
  if (!Number.isInteger(draft.gridSize) || draft.gridSize < 2 || draft.gridSize > 7) {
    return 'Размер карточки должен быть от 2 × 2 до 7 × 7.';
  }

  const deadline = new Date(draft.signupDeadline);
  if (Number.isNaN(deadline.getTime()) || deadline <= now) {
    return 'Дедлайн должен быть в будущем.';
  }

  const minimum = Math.max(5, draft.gridSize * draft.gridSize);
  const triggers = draft.triggers.filter((trigger) => trigger.label.trim());
  if (triggers.length < minimum) {
    return `Для карточки ${draft.gridSize} × ${draft.gridSize} добавь хотя бы ${minimum} триггеров.`;
  }
  if (triggers.some((trigger) => trigger.label.trim().length > 120)) {
    return 'Каждый триггер должен быть короче 120 символов.';
  }

  if (triggers.some((trigger) => !EVENT_EMOJI_OPTIONS.includes(trigger.emoji as typeof EVENT_EMOJI_OPTIONS[number]))) {
    return 'Выбери значок для каждого триггера.';
  }

  const normalized = triggers.map((trigger) => trigger.label.trim().toLocaleLowerCase('ru-RU'));
  if (normalized.some((label) => !label) || new Set(normalized).size !== normalized.length) {
    return 'Убери пустые и повторяющиеся триггеры.';
  }

  return null;
}
