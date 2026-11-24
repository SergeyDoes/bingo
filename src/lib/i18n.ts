export type Language = 'ru' | 'en';

const browserLanguages = typeof navigator === 'undefined'
  ? []
  : (navigator.languages?.length ? navigator.languages : [navigator.language]);

export const language: Language = (browserLanguages[0] ?? '').toLowerCase().startsWith('ru')
  ? 'ru'
  : 'en';

export const locale = language === 'ru' ? 'ru-RU' : 'en-GB';

export function tr(russian: string, english: string): string {
  return language === 'ru' ? russian : english;
}
