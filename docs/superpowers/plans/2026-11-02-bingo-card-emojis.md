# Bingo Card Names and Emoji Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give each event/card and each trigger a separate emoji icon, and make trigger labels easier to read on bingo cards.

**Architecture:** Store event and trigger emojis as columns in Supabase. Extend the existing atomic create/update RPCs to validate and persist the emoji values with their labels. The React form uses a shared built-in emoji list, and event, trigger, and card views render names and icons separately.

**Tech Stack:** TypeScript, React, CSS, Supabase Postgres migration and RPCs.

**Spec:** `docs/superpowers/specs/2026-11-02-bingo-events-design.md`

## Global Constraints

- Event creation and setup updates remain atomic database operations.
- Event setup, including emojis, is locked once signup closes or the host starts the event.
- Only event members can read event and trigger display data; emails remain private.
- Keep card selection, click-to-add, click-to-remove, and drag-and-drop behavior intact.
- Do not add or run automated tests under the workspace instruction; use production build and source review.

## Review Focus

- Emoji arrays must have exactly one allowed icon for each event/trigger row; the RPC rejects mismatches atomically.
- Editing an existing trigger's emoji must preserve its ID, occurrence state, and card-cell references.
- Existing rows receive safe default emojis when the migration runs.
- Setup RPC remains host-only and signup-only after adding emoji parameters.
- Trigger text remains readable across supported board sizes and narrow screens.

---

### Task 1: Extend the database model and RPCs

**Files:**
- Create: `supabase/migrations/202611020004_expand_emoji_palette.sql`
- Modify: `src/lib/database.types.ts`

**Interfaces:**
- `events.emoji` and `event_triggers.emoji` are non-null text values with defaults for existing rows.
- `create_event_with_emoji_palette` accepts event emoji and paired trigger label/emoji arrays.
- `update_event_setup_with_emoji_palette` accepts event emoji and paired trigger label/emoji arrays.

- [x] Add event and trigger emoji columns with existing-row defaults; validate allowed palette values in both RPCs.
- [x] Add a private allowlist and compatibility RPC wrappers for the expanded palette while preserving trigger IDs and occurrence states.
- [x] Update generated-style TypeScript row and RPC argument types.
- [x] Review SQL for mismatch, invalid-icon, duplicate-label, non-host, and post-start input rejection.

### Task 2: Add event and trigger emoji selection

**Files:**
- Create: `src/features/events/emojiOptions.ts`
- Modify: `src/features/events/eventValidation.ts`
- Modify: `src/features/events/CreateEventForm.tsx`
- Modify: `src/features/events/eventApi.ts`
- Modify: `src/features/events/HostEventPage.tsx`

**Interfaces:**
- `EventDraft` contains `emoji: string` and `triggers: Array<{ label: string; emoji: string }>` alongside title, grid size, and deadline.
- The shared emoji list is mirrored in a private database allowlist and checked by both client validation and database RPCs.

- [x] Provide one curated emoji option list and defaults for the event and each trigger; include 🤡, 💀, ▶️, 🔁, ⏯️, ⏸️.
- [x] Replace dropdowns with a visible emoji grid picker and retain count/minimum guidance and form validation.
- [x] Persist event and trigger emoji values through create/update RPCs and load them into the edit form.

### Task 3: Render event and trigger identity clearly

**Files:**
- Modify: `src/features/events/DashboardPage.tsx`
- Modify: `src/features/events/HostEventPage.tsx`
- Modify: `src/features/events/ActiveEventPanel.tsx`
- Modify: `src/features/cards/ParticipantEventPage.tsx`
- Modify: `src/features/cards/CardBuilder.tsx`
- Modify: `src/styles.css`

- [x] Show event emoji with the event title in dashboard, host, and participant views.
- [x] Show trigger emoji next to trigger names in lists and card cells.
- [x] Increase cell label font size and emoji icon size, and use a grid picker that remains usable on narrow screens.

### Task 4: Update setup guidance and verify

**Files:**
- Modify: `README.md`

- [x] Document the ordered migration update required to add event and trigger emojis.
- [x] Run `npm run build`; expected: TypeScript and Vite produce `dist/` without errors.
- [x] Review the final diff and ensure no credentials were added to tracked files.
