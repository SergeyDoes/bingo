# Bingo Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static-hosted bingo events app where hosts create events, participants compose cards, and completed lines determine the leaderboard.

**Architecture:** React single-page app served by GitHub Pages, with Supabase Auth and Postgres as the shared backend. The event phase is derived from its deadline, manual start timestamp, and finalization timestamp so a deadline starts an event without a background scheduler. Supabase row-level security and narrowly scoped database functions enforce host and participant permissions.

**Tech Stack:** TypeScript, React, Vite, React Router, Supabase JavaScript client, CSS, Supabase SQL migrations, GitHub Actions Pages deployment.

**Spec:** `docs/superpowers/specs/2026-11-02-bingo-events-design.md`

## Global Constraints

- The frontend is deployable as static files on GitHub Pages; event data and identity live in Supabase.
- Supabase client configuration uses public browser credentials only; privileged operations are protected by database policies or server-side functions.
- Authentication uses email magic links.
- A completed horizontal row, vertical column, or either main diagonal is one point.
- The signup deadline starts the event and locks participant cards; the host can start it manually earlier.
- Incomplete participant cards at event start are excluded from scoring and the leaderboard.
- Finalization freezes trigger occurrence and is irreversible.

## Review Focus

- Deadline/manual-start race: card changes are rejected at or after the effective start time, including when a browser has stale state (enforce in database functions/policies).
- Malformed board setup: reject invalid grid sizes and fewer than `grid_size²` unique triggers before event creation or card submission.
- Cross-event card tampering: reject a card cell that references a trigger from another event or duplicates a trigger/position.
- Unauthorized edits: non-hosts cannot edit event settings or occurrence states; participants cannot edit another user's card.
- Invalid finalization: reject finalization before start and reject all later trigger-state changes.

---

### Task 1: Scaffold the static React app

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `.env.example`

**Interfaces:**
- Produces: React app entry at `src/main.tsx`, app root `src/App.tsx`, Vite build output in `dist/`.

- [ ] Scaffold Vite + React + TypeScript with `dev`, `build`, and `preview` scripts; add React Router and `@supabase/supabase-js`.
- [ ] Configure Vite's `base` from `VITE_BASE_PATH` with `/` as local default, and add `VITE_SUPABASE_URL` plus `VITE_SUPABASE_ANON_KEY` to `.env.example`.
- [ ] Add a responsive app shell, route placeholders for dashboard, event, and auth callback, and simple visual tokens in `src/styles.css`.
- [ ] Run `npm run build`; expected: TypeScript and Vite produce `dist/` without errors.

### Task 2: Define Supabase schema and access controls

**Files:**
- Create: `supabase/migrations/202611020001_bingo_events.sql`
- Create: `src/lib/supabase.ts`
- Create: `src/lib/database.types.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `supabase` client in `src/lib/supabase.ts`; database row and RPC types in `src/lib/database.types.ts`.

- [ ] Create tables `events`, `event_triggers`, `participants`, and `card_cells` with UUID keys, event/user ownership, unique card positions, one participant per user/event, and foreign keys that keep cells tied to triggers in the same event.
- [ ] Limit board size to 3–7 and trigger text to 1–120 characters; require at least `max(5, grid_size²)` distinct triggers in the pool and exactly `grid_size²` distinct cells for a complete card.
- [ ] Store `deadline`, nullable `manual_started_at`, and nullable `finalized_at` on events. Define effective phase as signup before both start conditions, active after manual start or deadline, and finalized after `finalized_at`.
- [ ] Enable row-level security on all tables. Allow authenticated invite-link readers, host-only event configuration, self-only participant/card edits before effective start, and host-only trigger occurrence updates during active phase.
- [ ] Add database functions for atomic event creation, manual start, trigger occurrence updates, and finalization; validate event ownership and phase in each function and make finalization irreversible.
- [ ] Initialize the Supabase browser client from the two public environment variables; fail clearly when either is missing.
- [ ] Review the migration for all five Review Focus cases; expected: each is blocked at the database boundary, not only in the UI.

### Task 3: Add authentication and shared domain helpers

**Files:**
- Create: `src/features/auth/AuthProvider.tsx`
- Create: `src/features/auth/AuthPage.tsx`
- Create: `src/features/auth/CallbackPage.tsx`
- Create: `src/lib/phase.ts`
- Create: `src/lib/bingo.ts`
- Create: `src/lib/errors.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `getEventPhase(event: Pick<EventRow, "deadline" | "manual_started_at" | "finalized_at">, now?: Date): "signup" | "active" | "finalized"` and `countCompletedLines(gridSize: number, occurredPositions: ReadonlySet<number>): number`; positions are zero-based row-major indices.
- Auth provider exposes current user, loading state, `signInWithEmail(email, redirectTo)`, and `signOut()`.

- [ ] Implement magic-link sign-in and callback session handling with a redirect back to the intended event URL.
- [ ] Implement phase calculation: finalized timestamp takes precedence; otherwise manual start or elapsed deadline means active; else signup.
- [ ] Implement line scoring across each row, each column, and both main diagonals, counting every completed line independently.
- [ ] Add shared error formatting for Supabase auth, permission, and validation errors.
- [ ] Run `npm run build`; expected: app builds with typed auth and domain helpers.

### Task 4: Build host dashboard and event setup

**Files:**
- Create: `src/features/events/eventApi.ts`
- Create: `src/features/events/DashboardPage.tsx`
- Create: `src/features/events/CreateEventForm.tsx`
- Create: `src/features/events/HostEventPage.tsx`
- Create: `src/features/events/eventValidation.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: Supabase client, auth provider, `getEventPhase`, shared error formatting.
- Produces: `createEvent(input: EventDraft, hostId: string)`, `getEvent(eventId: string)`, and `updateEventSetup(eventId: string, input: EventDraft)` in `eventApi.ts`.

- [ ] Implement authenticated dashboard listing events hosted by the current user and a create-event flow for title, square card size, signup deadline, and trigger pool.
- [ ] Validate title, future deadline, card size, unique trigger texts, and enough triggers for the chosen grid before writing.
- [ ] Implement host event setup editing before start and display a copyable invite URL using the current origin and event route.
- [ ] Add the early manual-start action; on success refresh event state and show that participant cards are now locked.
- [ ] Run `npm run build`; expected: host routes compile and setup forms expose validation and Supabase errors clearly.

### Task 5: Build participant joining and card composition

**Files:**
- Create: `src/features/cards/cardApi.ts`
- Create: `src/features/cards/JoinEventPage.tsx`
- Create: `src/features/cards/CardBuilder.tsx`
- Create: `src/features/cards/ParticipantEventPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `getEvent`, `getEventPhase`, auth provider, Supabase client.
- Produces: `joinEvent(eventId: string, userId: string)`, `saveCard(participantId: string, cells: Array<{ position: number; triggerId: string }>)`, and `getParticipantCard(eventId: string, userId: string)` in `cardApi.ts`.

- [ ] Implement invite-link event view and require magic-link authentication before joining.
- [ ] Let a participant choose distinct trigger tiles to fill every cell; show progress and prevent submission until the card is complete.
- [ ] Allow the participant to replace a selected trigger removed by the host while signup remains open; an incomplete card at start remains excluded from scoring.
- [ ] At manual start or deadline, make the card read-only and show the active event state. Enforce this in the database as well as the UI.
- [ ] Run `npm run build`; expected: invite, join, and card routes build and display locked/incomplete states.

### Task 6: Add live trigger updates and leaderboard

**Files:**
- Create: `src/features/events/ActiveEventPanel.tsx`
- Create: `src/features/events/Leaderboard.tsx`
- Modify: `src/features/events/eventApi.ts`
- Modify: `src/features/cards/cardApi.ts`
- Modify: `src/features/cards/ParticipantEventPage.tsx`
- Modify: `src/features/events/HostEventPage.tsx`

**Interfaces:**
- Consumes: `countCompletedLines`, event/participant/card APIs, `getEventPhase`.
- Produces: `setTriggerOccurred(eventId, triggerId, occurred)`, `finalizeEvent(eventId)`, and `getEventResults(eventId)`.

- [ ] Let the host toggle each trigger as occurred during active phase; propagate updates through Supabase Realtime with a refresh fallback.
- [ ] Show participant cards with occurred triggers highlighted and current completed-line score calculated from rows, columns, and both diagonals.
- [ ] Show the leaderboard ordered by score descending, with tied scores sharing rank and incomplete cards omitted.
- [ ] Add host finalization; confirm the action in the UI, then freeze trigger updates and show final results.
- [ ] Run `npm run build`; expected: active and finalized views compile with live-data refresh handling.

### Task 7: Publish on GitHub Pages and document setup

**Files:**
- Create: `.github/workflows/deploy-pages.yml`
- Create: `README.md`
- Modify: `vite.config.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Vite build output in `dist/` and repository Actions secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

- [ ] Add a GitHub Actions workflow that builds and deploys `dist/` to GitHub Pages on pushes to the default branch, setting `VITE_BASE_PATH` to `/${repository_name}/` for project pages.
- [ ] Configure SPA route fallback for Pages and document the repository subpath setting through `VITE_BASE_PATH`.
- [ ] Document local setup, Supabase project creation, applying migrations, allowed auth redirect URLs, GitHub Pages configuration, and Actions secrets. State clearly that the service-role key must never be added to the frontend.
- [ ] Run `npm run build`; expected: production bundle is generated using the configured base path and public Supabase values.
