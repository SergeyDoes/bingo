import type { EventRow } from './database.types';

export type EventPhase = 'signup' | 'active' | 'finalized';

type EventTiming = Pick<EventRow, 'signup_deadline' | 'manual_started_at' | 'finalized_at'>;

export function getEventPhase(event: EventTiming, now = new Date()): EventPhase {
  if (event.finalized_at) return 'finalized';
  if (event.manual_started_at || new Date(event.signup_deadline).getTime() <= now.getTime()) return 'active';
  return 'signup';
}
