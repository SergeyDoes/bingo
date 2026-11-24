# Guest participation and card recovery plan

## Scope

Implement invite-link participation without Twitch, with a nickname, an anonymous Supabase session, and one recoverable secret per card. Keep the event dashboard's compact row layout and the existing Twitch paths intact.

## Tasks

1. **Add the database migration.** Create a private recovery table keyed by participant, install/use `pgcrypto`, revoke direct API grants, and keep recovery verifiers out of client-readable tables. Replace `join_event` so Twitch names remain authoritative while anonymous users supply a validated display name and initial recovery code. Add an atomic recovery RPC that transfers one participant to the caller, consumes the old code, stores the new verifier, and revokes the old user's moderator assignment for that event. Preserve event invite/deadline checks and card ownership rules.
2. **Extend auth and routing.** Add `signInAnonymously` to the auth context. Let the invite page initialize a guest session instead of redirecting signed-out invitees to Twitch login. Continue to protect host routes and require a valid user session on player-card routes.
3. **Build the invite and recovery flow.** On first visit, load the event and show the nickname form plus a recover-card option. Generate a short name and a 12-character recovery code with Web Crypto. After joining, show the code with copy controls and a continue button; temporarily keep the key in browser storage until confirmed so refresh/new tab cannot silently lose it. Recovery accepts the card's code, generates a replacement, and shows the rotated code before opening the same card.
4. **Keep identity paths distinct.** Twitch users continue to join automatically with their verified Twitch name and do not receive guest recovery codes. Same-browser guests return to their existing card without another prompt. A nickname alone never recovers a card.
5. **Document project setup and errors.** Add concise instructions to enable Supabase Anonymous Sign-Ins and apply the new migration. Explain that recovery codes are private and that Supabase applies an anonymous sign-in rate limit. Show a clear invite-page error if the Supabase project setting is disabled or the rate limit is hit.
6. **Review and verify.** Inspect SQL function grants, private table access, identity transfer, uniqueness/conflict handling, and unchanged Twitch behavior. Run the production TypeScript/Vite build and `git diff --check`. Do not add or run a test suite unless asked.

## Execution notes

- Existing code and data live in `supabase/migrations`; add a forward-only migration rather than rewriting applied migrations.
- The user applies the migration in the Supabase SQL Editor and enables Anonymous Sign-Ins in the Supabase dashboard. No service-role key may be added to the GitHub Pages client.
- A recovered card keeps its participant/card row IDs and historical results. The prior browser loses card ownership after transfer. If the previous session was a moderator for that event, its moderator grant is removed; the host may assign the new session separately.
- The recovery secret is generated with `crypto.getRandomValues`, displayed in grouped form, sent to a `SECURITY DEFINER` RPC over HTTPS, and hashed in PostgreSQL. Only the verifier is stored in a private table with no client grants.

## Review focus

- Anonymous sign-in disabled, rate-limited, or unavailable.
- Invalid, malformed, already-consumed, or wrong-event recovery code.
- Recovery when the target auth user already owns another participant row in that same event.
- Recovery during signup, active, and finalized event phases.
- Ensure a recovery verifier cannot be selected through any client API or exposed in RPC results.
- Ensure host, moderator, and Twitch participant behavior remains unchanged.
