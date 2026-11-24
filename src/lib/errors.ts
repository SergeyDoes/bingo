import { tr } from './i18n';

export function formatError(error: unknown, fallback = tr('Не удалось выполнить действие. Попробуйте ещё раз.', 'Something went wrong. Please try again.')): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}
