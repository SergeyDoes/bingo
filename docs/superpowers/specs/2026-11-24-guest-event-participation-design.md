# Guest event participation — design

## Intent

Let invitees join and play without signing in to Twitch. The first visit to an invite link asks for a display name and then opens the player card. Returning in the same browser should reopen the existing card without asking for the name again.

## Goals

- No visible account creation or Twitch login in the invite flow.
- Keep each guest's card and edits tied to that guest in the current browser.
- Preserve the existing Twitch host and moderator permissions.
- Use the existing Supabase Auth user identity and participant ownership checks where possible.

## Non-goals and limitations

- Recovery works only for the individual event card whose secret code the player saved.
- A guest display name is not verified and does not prove who the player is; the recovery code is a bearer secret and must be kept private.
- Guest accounts cannot create events or become moderators through the guest flow.

## Approaches considered

1. **Supabase Anonymous Auth (selected).** Create an anonymous Supabase session in the invite flow, then ask only for a display name. Supabase persists the session in the browser and supplies a stable `auth.uid()` for existing participant/card ownership checks. This requires enabling Anonymous Sign-Ins in the Supabase project and a migration that lets the join function accept a name for anonymous users while preserving Twitch identity for Twitch users.
2. **Custom guest capability token.** Create and persist an opaque per-player token, hash it in the database, and change join, card access, and save authorization to validate that token. This avoids Supabase anonymous accounts but adds a parallel identity and authorization system.
3. **Nickname only.** Use the submitted name as the identity. This cannot distinguish the original player from someone reusing the same name, so it cannot safely protect card edits and is not selected.

## User flow

1. A signed-out player opens an event invite link.
2. The app silently creates or restores a Supabase anonymous session.
3. If that session already has a participant record for this event, go directly to the saved card.
4. Otherwise show the event invitation, a required `Nickname` field (prefilled with a generated `Guest-####` name that can be changed), a `Join event` button, and a `Recover card` option.
5. On a new join, the app generates a 12-character, human-readable recovery code (shown in three groups), displays it with a copy button, and asks the player to save it before continuing to the card. Until the player confirms saving it, keep it temporarily in browser local storage so a reload or new tab can show it again; clear it after confirmation. The code is scoped to this one participant card/event.
6. To recover on another browser, the guest starts a new anonymous session, enters the recovery code on the invite page, and is returned to the same participant and card. A successful recovery transfers that participant to the new session and rotates the code; the replacement code is shown and must be saved. The previous browser session then loses ownership of that card. If the old guest was a moderator, revoke that old session's moderator assignment for this event; the host can assign the new session separately.
7. The existing `save_card` authorization continues to require the participant's `user_id` to match `auth.uid()`.

## Security and data changes

- Enable Supabase Anonymous Sign-Ins in Auth settings. This is a project dashboard setting and must be done by the project owner.
- Supabase currently limits anonymous sign-ins to 30 requests per hour per IP by default. Handle a limit response clearly; review CAPTCHA and rate-limit settings before inviting a large audience. Anonymous Auth users are not automatically cleaned up, so do not delete users that still own participant rows.
- Add a forward-only SQL migration updating `join_event`: Twitch users keep their verified Twitch nickname; anonymous users must supply a trimmed 1–32 character display name and recovery-code verifier. Keep the invite-token and signup-deadline checks, and do not grant guests host or moderator rights.
- Store recovery-code verifiers in a new private table keyed by participant, not in `participants`: members can read participant rows today, so adding a verifier column there would expose recovery credentials. Revoke direct table access and perform create/rotate/claim only in `SECURITY DEFINER` RPCs.
- Generate the 12-character code from a 32-character alphabet that omits ambiguous characters, using the browser cryptographic random API. Send the raw code only to an RPC over HTTPS; calculate and store its SHA-256 verifier in PostgreSQL with `pgcrypto`. Claiming a code atomically transfers the participant to the current authenticated user, revokes the old user's moderator assignment for this event, and replaces the verifier with a newly generated code's verifier.
- Keep participant and card ownership scoped to the authenticated anonymous user ID. Do not grant direct anonymous-role access to participant or card tables; anonymous Auth users use Supabase's authenticated role.
- Update invite routing so a signed-out visitor reaches the guest join flow instead of being redirected to the Twitch login page. Keep host management protected by its existing authorization checks.

## Copy and behavior

The guest sees a simple name form, not Supabase terminology. A generated name is only a convenient default; the player may edit it before joining. The guest session is remembered only in that browser. A new browser creates a different guest identity; entering that card's recovery code transfers the card to the new identity. The recovery code itself is the proof of control, not the typed nickname.

## Acceptance criteria

- A signed-out visitor can open an invite, choose a nickname, join before the deadline, build and save a card without Twitch login.
- A first-time guest receives a per-card recovery code and can copy it before continuing.
- A reload or new tab before key confirmation re-displays the pending key; confirming it removes the temporary browser copy.
- Recovery-code verifiers are not readable from client-facing participant rows or other client APIs.
- Reloading or reopening the link in the same browser returns to the same participant card.
- The recovery code restores only that event card in another browser. On successful recovery it is rotated, and the old code no longer works.
- Recovering a card does not grant the new owner moderator permission and revokes the old guest's moderator assignment for that event.
- Entering the same nickname in a different browser without that card's recovery code creates a separate participant, not access to the first card.
- Guests cannot join after the event starts, create events, or modify another player's card.
- Existing Twitch join, host, moderator, and event-management flows continue to work.

## Decisions left to implementation

- Generate a short guest nickname client-side and let the user edit it before joining.
- Generate a copyable recovery code per card, display it after joining, and rotate it after a successful recovery.
- Attempt anonymous sign-in only on an invite route; show a clear setup error if Anonymous Sign-Ins have not been enabled.
- Retain the current invite page and card builder, adding a compact nickname form before the card is created.
