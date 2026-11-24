import type { CardCellRow, EventRow, EventTriggerRow, Json, ParticipantRow } from '../../lib/database.types';
import { requireSupabase } from '../../lib/supabase';
import { tr } from '../../lib/i18n';

export interface JoinResult {
  eventId: string;
  participantId: string | null;
  displayName: string | null;
  isHost: boolean;
  requiresName: boolean;
  signupOpen: boolean;
  title: string;
  gridSize: number;
  signupDeadline: string;
}

export interface ParticipantCard {
  participant: ParticipantRow;
  cells: CardCellRow[];
}

function parseJoinResult(value: Json): JoinResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(tr('Ссылка есть, а данных события нет. Попробуй открыть её ещё раз.', 'The link is valid, but event data is missing. Try opening it again.'));
  }
  const result = value as Record<string, Json | undefined>;
  if (typeof result.event_id !== 'string' || typeof result.title !== 'string' || typeof result.grid_size !== 'number' || typeof result.signup_deadline !== 'string') {
    throw new Error(tr('Сервер вернул неполные данные события.', 'The server returned incomplete event data.'));
  }
  return {
    eventId: result.event_id,
    participantId: typeof result.participant_id === 'string' ? result.participant_id : null,
    displayName: typeof result.display_name === 'string' ? result.display_name : null,
    isHost: result.is_host === true,
    requiresName: result.requires_name === true,
    signupOpen: result.signup_open !== false,
    title: result.title,
    gridSize: result.grid_size,
    signupDeadline: result.signup_deadline,
  };
}

export async function joinEvent(inviteToken: string, displayName?: string, recoveryCode?: string): Promise<JoinResult> {
  const { data, error } = await requireSupabase().rpc('join_event', {
    p_invite_token: inviteToken,
    p_display_name: displayName?.trim() || null,
    p_guest_recovery_code: recoveryCode ?? null,
  });
  if (error) throw error;
  return parseJoinResult(data as Json);
}

export async function recoverGuestCard(inviteToken: string, recoveryCode: string, replacementCode: string): Promise<JoinResult> {
  const { data, error } = await requireSupabase().rpc('recover_guest_card', {
    p_invite_token: inviteToken,
    p_recovery_code: recoveryCode,
    p_replacement_code: replacementCode,
  });
  if (error) throw error;
  return parseJoinResult(data as Json);
}

export async function getParticipantCard(eventId: string, userId: string): Promise<ParticipantCard> {
  const client = requireSupabase();
  const { data: participant, error: participantError } = await client
    .from('participants')
    .select('*')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();
  if (participantError) throw participantError;
  if (!participant) throw new Error(tr('У тебя пока нет карточки для этого события.', 'You do not have a card for this event yet.'));

  const { data: cells, error: cellsError } = await client
    .from('card_cells')
    .select('*')
    .eq('event_id', eventId)
    .eq('participant_id', participant.id)
    .order('position', { ascending: true });
  if (cellsError) throw cellsError;
  return { participant, cells: cells ?? [] };
}

export async function saveCard(participantId: string, cells: Array<{ position: number; triggerId: string }>): Promise<number> {
  const payload = cells.map(({ position, triggerId }) => ({ position, trigger_id: triggerId })) as Json;
  const { data, error } = await requireSupabase().rpc('save_card', {
    p_participant_id: participantId,
    p_cells: payload,
  });
  if (error) throw error;
  if (typeof data !== 'number') throw new Error(tr('Карточка сохранена без подтверждения сервера.', 'The card was saved without server confirmation.'));
  return data;
}

export interface ParticipantEventData {
  event: EventRow;
  triggers: EventTriggerRow[];
  card: ParticipantCard;
}
