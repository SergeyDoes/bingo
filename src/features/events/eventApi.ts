import type { EventRow, EventTriggerRow, ParticipantRow, Json } from '../../lib/database.types';
import { requireSupabase } from '../../lib/supabase';
import type { EventDraft } from './eventValidation';
import { tr } from '../../lib/i18n';

export interface CreatedEvent {
  eventId: string;
  inviteToken: string;
}

export interface EventResult {
  participantId: string;
  displayName: string;
  score: number;
}

export interface ParticipantEvent extends EventRow {
  card_updated_at: string | null;
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

export async function listParticipantEvents(userId: string): Promise<ParticipantEvent[]> {
  const client = requireSupabase();
  const { data: participantRows, error: participantError } = await client
    .from('participants')
    .select('event_id, card_updated_at')
    .eq('user_id', userId);
  if (participantError) throw participantError;
  if (!participantRows?.length) return [];

  const eventIds = [...new Set(participantRows.map((row) => row.event_id))];
  const { data: events, error: eventError } = await client.from('events').select('*').in('id', eventIds);
  if (eventError) throw eventError;
  const cardUpdates = new Map(participantRows.map((row) => [row.event_id, row.card_updated_at]));
  return (events ?? []).map((event) => ({ ...event, card_updated_at: cardUpdates.get(event.id) ?? null }));
}

export async function listPublicEvents(): Promise<EventRow[]> {
  const { data, error } = await requireSupabase()
    .from('events')
    .select('*')
    .eq('is_public', true)
    .is('manual_started_at', null)
    .is('finalized_at', null)
    .gt('signup_deadline', new Date().toISOString())
    .order('signup_deadline', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getFollowedTwitchIds(): Promise<Set<string>> {
  const client = requireSupabase();
  const twitchClientId = import.meta.env.VITE_TWITCH_CLIENT_ID?.trim();
  const providerToken = window.localStorage.getItem('bingo:twitch-provider-token');
  if (!twitchClientId) throw new Error(tr('Не настроен Twitch Client ID для поиска подписок.', 'Twitch Client ID is not configured for follower lookup.'));
  if (!providerToken) throw new Error(tr('Перезайди через Twitch, чтобы разрешить чтение подписок.', 'Sign in with Twitch again to allow access to your follows.'));
  const { data: userId, error } = await client.rpc('get_my_twitch_id');
  if (error) throw error;
  if (!userId) throw new Error(tr('Не удалось определить твой Twitch ID. Войди через Twitch ещё раз.', 'Could not identify your Twitch ID. Sign in with Twitch again.'));

  const followed = new Set<string>();
  let cursor: string | undefined;
  do {
    const url = new URL('https://api.twitch.tv/helix/channels/followed');
    url.searchParams.set('user_id', userId);
    url.searchParams.set('first', '100');
    if (cursor) url.searchParams.set('after', cursor);
    const response = await fetch(url, {
      headers: { 'Client-ID': twitchClientId, Authorization: `Bearer ${providerToken}` },
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error(tr('Разрешение Twitch истекло или подписки не разрешены. Выйди и войди через Twitch заново.', 'Twitch authorization expired or follows access was denied. Sign out and back in.'));
      throw new Error(tr('Не удалось получить список Twitch-подписок. Попробуй позже.', 'Could not load your Twitch follows. Try again later.'));
    }
    const page = await response.json() as { data?: Array<{ broadcaster_id: string }>; pagination?: { cursor?: string } };
    for (const channel of page.data ?? []) followed.add(channel.broadcaster_id);
    cursor = page.pagination?.cursor;
  } while (cursor);
  return followed;
}

export async function getEventModerators(eventId: string): Promise<string[]> {
  const { data, error } = await requireSupabase().from('event_moderators').select('user_id').eq('event_id', eventId);
  if (error) throw error;
  return (data ?? []).map((row) => row.user_id);
}

export async function setEventModerator(eventId: string, userId: string, moderator: boolean): Promise<void> {
  const { error } = await requireSupabase().rpc('set_event_moderator', {
    target_event_id: eventId,
    target_user_id: userId,
    moderator_value: moderator,
  });
  if (error) throw error;
}

export async function createEvent(input: EventDraft): Promise<CreatedEvent> {
  const client = requireSupabase();
  const args = {
    p_title: input.title.trim(),
    p_signup_deadline: new Date(input.signupDeadline).toISOString(),
    p_event_emoji: input.emoji,
    p_trigger_labels: input.triggers.map((trigger) => trigger.label.trim()),
    p_trigger_emojis: input.triggers.map((trigger) => trigger.emoji),
  };
  const { data, error } = input.gridSize === 2
    ? await client.rpc('create_test_event_2x2', args)
    : await client.rpc('create_event_with_emoji_palette', { ...args, p_grid_size: input.gridSize });
  if (error) throw error;
  if (input.isPublic) {
    const result = data as Json;
    if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.event_id !== 'string') {
      throw new Error(tr('Событие создано, но не удалось включить публичность.', 'Event created, but public listing could not be enabled.'));
    }
    const { error: visibilityError } = await requireSupabase().rpc('set_event_public', { target_event_id: result.event_id, public_value: true });
    if (visibilityError) throw visibilityError;
  }
  const result = data as Json;
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(tr('Событие создано, но сервер не вернул ссылку для ведущего.', 'Event created, but the server did not return a host link.'));
  }
  const eventId = result.event_id;
  const inviteToken = result.invite_token;
  if (typeof eventId !== 'string' || typeof inviteToken !== 'string') {
    throw new Error(tr('Сервер вернул неполные данные события.', 'The server returned incomplete event data.'));
  }
  return { eventId, inviteToken };
}

export async function getEvent(eventId: string): Promise<EventRow> {
  const { data, error } = await requireSupabase().from('events').select('*').eq('id', eventId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(tr('Событие не найдено или у вас нет доступа.', 'Event not found or you do not have access.'));
  return data;
}

export async function getEventTriggers(eventId: string): Promise<EventTriggerRow[]> {
  const { data, error } = await requireSupabase()
    .from('event_triggers')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function deleteEvent(eventId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('delete_event', { p_event_id: eventId });
  if (error) throw error;
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
  const { error: visibilityError } = await requireSupabase().rpc('set_event_public', { target_event_id: eventId, public_value: input.isPublic });
  if (visibilityError) throw visibilityError;
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
