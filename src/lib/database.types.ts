export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type EventRow = {
  id: string;
  invite_token: string;
  host_id: string;
  host_twitch_name: string | null;
  title: string;
  emoji: string;
  is_public: boolean;
  grid_size: number;
  signup_deadline: string;
  manual_started_at: string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EventTriggerRow = {
  id: string;
  event_id: string;
  label: string;
  emoji: string;
  occurred: boolean;
  created_at: string;
};

export type ParticipantRow = {
  id: string;
  event_id: string;
  user_id: string;
  display_name: string;
  joined_at: string;
};

export type CardCellRow = {
  event_id: string;
  participant_id: string;
  trigger_id: string;
  position: number;
};

export interface Database {
  public: {
    Tables: {
      events: {
        Row: EventRow;
        Insert: Partial<EventRow> & Pick<EventRow, 'host_id' | 'title' | 'grid_size' | 'signup_deadline'>;
        Update: Partial<Pick<EventRow, 'title' | 'signup_deadline'>>;
        Relationships: [];
      };
      event_moderators: {
        Row: { event_id: string; user_id: string; assigned_at: string };
        Insert: { event_id: string; user_id: string; assigned_at?: string };
        Update: Record<string, never>;
        Relationships: [];
      };
      event_triggers: {
        Row: EventTriggerRow;
        Insert: Pick<EventTriggerRow, 'event_id' | 'label'> & Partial<Pick<EventTriggerRow, 'id' | 'emoji' | 'occurred' | 'created_at'>>;
        Update: Partial<Pick<EventTriggerRow, 'label' | 'emoji'>>;
        Relationships: [];
      };
      participants: {
        Row: ParticipantRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      card_cells: {
        Row: CardCellRow;
        Insert: CardCellRow;
        Update: Partial<CardCellRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_test_event_2x2: { Args: { p_title: string; p_signup_deadline: string; p_event_emoji: string; p_trigger_labels: string[]; p_trigger_emojis: string[] }; Returns: Json };
      set_event_public: { Args: { target_event_id: string; public_value: boolean }; Returns: boolean };
      set_event_moderator: { Args: { target_event_id: string; target_user_id: string; moderator_value: boolean }; Returns: boolean };
      is_event_moderator: { Args: { target_event_id: string }; Returns: boolean };
      is_bingo_host_authorized: { Args: Record<string, never>; Returns: boolean };
      create_event: {
        Args: { p_title: string; p_grid_size: number; p_signup_deadline: string; p_trigger_labels: string[] };
        Returns: Json;
      };
      create_event_with_emojis: {
        Args: { p_title: string; p_grid_size: number; p_signup_deadline: string; p_event_emoji: string; p_trigger_labels: string[]; p_trigger_emojis: string[] };
        Returns: Json;
      };
      create_event_with_emoji_palette: {
        Args: { p_title: string; p_grid_size: number; p_signup_deadline: string; p_event_emoji: string; p_trigger_labels: string[]; p_trigger_emojis: string[] };
        Returns: Json;
      };
      join_event: {
        Args: { p_invite_token: string; p_display_name?: string | null };
        Returns: Json;
      };
      save_card: {
        Args: { p_participant_id: string; p_cells: Json };
        Returns: number;
      };
      update_event_setup: {
        Args: { p_event_id: string; p_title: string; p_signup_deadline: string; p_trigger_labels: string[] };
        Returns: boolean;
      };
      update_event_setup_with_emojis: {
        Args: { p_event_id: string; p_title: string; p_signup_deadline: string; p_event_emoji: string; p_trigger_labels: string[]; p_trigger_emojis: string[] };
        Returns: boolean;
      };
      update_event_setup_with_emoji_palette: {
        Args: { p_event_id: string; p_title: string; p_signup_deadline: string; p_event_emoji: string; p_trigger_labels: string[]; p_trigger_emojis: string[] };
        Returns: boolean;
      };
      start_event: { Args: { p_event_id: string }; Returns: boolean };
      set_trigger_occurred: {
        Args: { p_event_id: string; p_trigger_id: string; p_occurred: boolean };
        Returns: boolean;
      };
      finalize_event: { Args: { p_event_id: string }; Returns: boolean };
      get_event_results: {
        Args: { p_event_id: string };
        Returns: Array<{ participant_id: string; display_name: string; score: number }>;
      };
      has_event_access: { Args: { target_event_id: string }; Returns: boolean };
      is_event_host: { Args: { target_event_id: string }; Returns: boolean };
      is_signup_open: { Args: { target_event_id: string }; Returns: boolean };
      is_event_active: { Args: { target_event_id: string }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
