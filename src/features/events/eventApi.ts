import type { EventRow, EventTriggerRow, ParticipantRow, Json } from '../../lib/database.types';
import { requireSupabase } from '../../lib/supabase';
import type { EventDraft } from './eventValidation';

export interface CreatedEvent {
  eventId: string;
  inviteToken: string;
}

export interface EventResult {
  participantId: string;
  displayName: string;
  score: number;
}

export async function listHostEvents(hostId: string): Promise<EventRow[]> {
  const { data, error } = await requireSupabase()
    .from('events')
    .select('*')
    .eq('host_id', hostId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createEvent(input: EventDraft): Promise<CreatedEvent> {
  const { data, error } = await requireSupabase().rpc('create_event_with_emoji_palette', {
    p_title: input.title.trim(),
    p_grid_size: input.gridSize,
    p_signup_deadline: new Date(input.signupDeadline).toISOString(),
    p_event_emoji: input.emoji,
    p_trigger_labels: input.triggers.map((trigger) => trigger.label.trim()),
    p_trigger_emojis: input.triggers.map((trigger) => trigger.emoji),
  });
  if (error) throw error;
  const result = data as Json;
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('Событие создано, но сервер не вернул ссылку для ведущего.');
  }
  const eventId = result.event_id;
  const inviteToken = result.invite_token;
  if (typeof eventId !== 'string' || typeof inviteToken !== 'string') {
    throw new Error('Сервер вернул неполные данные события.');
  }
  return { eventId, inviteToken };
}

export async function getEvent(eventId: string): Promise<EventRow> {
  const { data, error } = await requireSupabase().from('events').select('*').eq('id', eventId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Событие не найдено или у вас нет доступа.');
  return data;
}

export async function getEventTriggers(eventId: string): Promise<EventTriggerRow[]> {
  const { data, error } = await requireSupabase()
    .from('event_triggers')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getEventParticipants(eventId: string): Promise<ParticipantRow[]> {
  const { data, error } = await requireSupabase()
    .from('participants')
    .select('*')
    .eq('event_id', eventId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function updateEventSetup(eventId: string, input: EventDraft): Promise<void> {
  const { error } = await requireSupabase().rpc('update_event_setup_with_emoji_palette', {
    p_event_id: eventId,
    p_title: input.title.trim(),
    p_signup_deadline: new Date(input.signupDeadline).toISOString(),
    p_event_emoji: input.emoji,
    p_trigger_labels: input.triggers.map((trigger) => trigger.label.trim()),
    p_trigger_emojis: input.triggers.map((trigger) => trigger.emoji),
  });
  if (error) throw error;
}

export async function startEvent(eventId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('start_event', { p_event_id: eventId });
  if (error) throw error;
}

export async function setTriggerOccurred(eventId: string, triggerId: string, occurred: boolean): Promise<void> {
  const { error } = await requireSupabase().rpc('set_trigger_occurred', {
    p_event_id: eventId,
    p_trigger_id: triggerId,
    p_occurred: occurred,
  });
  if (error) throw error;
}

export async function finalizeEvent(eventId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('finalize_event', { p_event_id: eventId });
  if (error) throw error;
}

export async function getEventResults(eventId: string): Promise<EventResult[]> {
  const { data, error } = await requireSupabase().rpc('get_event_results', { p_event_id: eventId });
  if (error) throw error;
  return (data ?? []).map((result) => ({
    participantId: result.participant_id,
    displayName: result.display_name,
    score: result.score,
  }));
}
