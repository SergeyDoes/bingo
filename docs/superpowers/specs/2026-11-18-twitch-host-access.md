# Twitch Sign-In and Manual Host Access

## Intent
Use Twitch OAuth for all users and restrict event creation to users manually authorized by the project owner.

## Architecture
Keep the GitHub Pages frontend static. Supabase Auth handles Twitch OAuth. A private allowlist table stores Twitch account IDs authorized to create events. A database helper reads the stable Twitch provider subject from the authenticated user's app metadata; event creation RPCs reject accounts absent from the allowlist. The Twitch ID is never editable by the user, and no service-role key is shipped to the browser.

## Setup
The Twitch Developer application redirects to the Supabase Auth callback. Supabase stores the Twitch Client ID and Client Secret. The owner grants access by inserting the Twitch numeric user ID into the private allowlist in the Supabase SQL Editor.

## UI
Replace email magic-link login with a Twitch sign-in button. Show a clear permission message to signed-in users without host access. Keep participant sign-in available to all Twitch users.

## Deployment
Retain the existing GitHub Pages workflow and configure the production site as a Supabase Auth redirect URL. Document repository Actions secrets and Twitch/Supabase provider setup.

## Security constraints
Enable RLS on the allowlist with no client-facing read/write policies. Enforce host authorization inside the event creation database RPC, not only in the UI. Keep existing ownership checks for host actions and participant flows.
