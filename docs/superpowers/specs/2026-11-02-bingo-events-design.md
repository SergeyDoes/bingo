# Bingo Events: Design

## Intent

Build a web service for hosting shared bingo events. A host defines possible triggers and a signup deadline; invited participants join through a link and build individual cards; the host marks triggers as they happen; after the event, participants are ranked by completed bingo lines.

## Goals

- Hosts can create and manage an event, its trigger pool, card size, and signup deadline.
- Participants can join an event and choose triggers for their personal card before the signup deadline and event start.
- The host can mark triggers as occurred during the event.
- Scores count completed rows, columns, and the two main diagonals; a leaderboard shows final scores.
- The frontend can be published on GitHub Pages, with Supabase providing authentication and shared persistence.

## Non-goals for the first version

- Payments, public event discovery, chat, notifications, moderation workflows, or multiple host roles.
- Custom scoring, arbitrary card shapes, free center squares, or a mobile native app.

## Constraints

- GitHub Pages serves a static frontend; event data and identity live in Supabase.
- Supabase client configuration uses public browser credentials only. Privileged operations must be protected by database policies or server-side functions, never by shipping a service-role key to the browser.
- The event invite URL is the entry point for participants. Authentication will use email magic links unless implementation constraints suggest otherwise.

## Approaches

1. **Static frontend + Supabase (recommended and selected):** suits GitHub Pages, supplies shared database and email authentication, and avoids operating a custom server. Requires Supabase configuration and careful row-level access policies.
2. **Custom backend and database:** gives full control, but adds server deployment and maintenance, which does not fit the preference to host simply on GitHub Pages.

## Product behavior

- Each event has a host, title, trigger pool, square card size, signup deadline, status, and invite link.
- Each participant chooses distinct triggers from the event pool for their card. The board is a square grid.
- The host's occurred/not-occurred state for each trigger is shared across all participant cards.
- A completed line is a fully occurred horizontal row, vertical column, or main diagonal. A completed line is worth one point. A participant's score is the number of completed lines; the leaderboard sorts by score.
- The signup deadline automatically starts the event: participant cards lock and the event becomes active. The host may also start the event manually before the deadline; manual start locks cards immediately and begins the active phase.
- Before the deadline, the host may revise the trigger pool and deadline. If a pool change removes a trigger already selected by a participant, that participant must choose a replacement before the deadline.
- Participants with incomplete cards when the event starts (by deadline or manual action) are excluded from scoring and the leaderboard; this does not block the start.
- The host can finalize the event after it has started; finalization freezes trigger occurrence and makes the leaderboard final and irreversible.

## First-version screens

- Event creation and host event-management view.
- Invite landing and participant card builder.
- Participant event view showing the live occurred triggers and current line score.
- Final leaderboard.

## Left to the builder

- Choose a mainstream static frontend stack compatible with GitHub Pages and keep deployment setup simple.
- Define validation limits for card size and trigger count, with a minimum of five triggers and enough unique triggers to fill the selected board.
- Use one host per event and email magic-link authentication.
- Implement row-level policies so participants can only manage their own membership and card, while only the host can change event triggers and occurrence states.
- Include local setup instructions and an example environment file; do not include live credentials.
- Keep the first version focused on the event lifecycle above.
