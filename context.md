# Project context

Living document describing the current state of this repo. Kept up to date as
things change — check the Changelog at the bottom for the most recent moves.

## What this is

`averis-hackathon` — a Next.js 16 (App Router) app: Supabase-authenticated
dashboard UI built on Base UI / shadcn-style components (Tailwind v4). Root
`/` currently renders the login page directly.

The whole app is kept TypeScript-only so it deploys as a single Vercel
project with no separate services to run. (`sdoc-hackathon-docker/` is a
related but *separate* Python/FastAPI dataset+scoring server for a hackathon
challenge — see its own README — it is not part of this deployed app.)

## Architecture

- Stack: Next.js 16 + React 19 + TypeScript, `@base-ui/react` components in
  the shadcn style, Supabase (`@supabase/ssr`) for auth, Tailwind v4.
- Routes: `/` (login), `/auth/login`, `/auth/signup`, `/dashboard`,
  `/dashboard/emails`.
- `app/dashboard/layout.tsx` holds the shared sidebar shell
  (`SidebarProvider` + `AppSidebar` + `SidebarInset`); each page under
  `/dashboard` supplies its own header/breadcrumb/content.
- `components/app-sidebar.tsx` has two sections: a **Workspace** group for
  real product features (currently just Emails), and a leftover
  Next.js-docs-style nav (placeholder scaffold from the original template,
  not yet replaced).
- No auth middleware exists yet — `/dashboard/*` isn't actually gated by a
  Supabase session check. Pre-existing gap, not introduced by the Emails
  feature; flagging it here so it isn't mistaken for "already handled."

## Feature: Emails (shipment inbox)

**Goal (stated by the user):** employees cc/send shipment-related emails to
`averisbot@gmail.com` instead of scattering them across personal inboxes, so
the system can centralize and eventually automate processing. This first
stage is view-only: list and read what's landed in that mailbox from inside
the app.

**Implementation** — pure TypeScript, connecting to Gmail over **IMAP** with
an app password (`imapflow` + `mailparser`). No OAuth consent screen, no
Google Cloud project, no literal MCP server in the request path (the user
confirmed "MCP" was meant loosely as "connect to Gmail programmatically," not
the actual Model Context Protocol). This keeps the feature fully runnable as
a normal Vercel serverless function, and — per explicit user requirement —
means nobody ever has to log in to averisbot@gmail.com through a browser, not
even once. An app password is a static credential you generate from account
settings, not an interactive login flow.

(We started with a Gmail REST API + OAuth2 refresh-token version. That's a
perfectly normal, valid approach too — OAuth would only ever need a *human to
log in once, ever*, as a one-time admin bootstrap, never per end-user — but
the user didn't want that interactive step to exist at all, so it was
replaced with IMAP + app password before any credentials were minted. Nothing
from the OAuth version remains.)

Files:
- `lib/gmail/config.ts` — env var access (`GMAIL_BOT_EMAIL`,
  `GMAIL_APP_PASSWORD`) and IMAP connection constants
  (`imap.gmail.com:993`).
- `lib/gmail/client.ts` — `listInboxEmails()` / `getEmailById(id)`. Opens a
  short-lived IMAP connection per call (serverless-friendly, no persistent
  connection to manage), searches with Gmail's `X-GM-RAW` IMAP extension
  (`to:averisbot@gmail.com OR cc:averisbot@gmail.com`), fetches each
  message's raw source, and parses it with `mailparser` into a plain
  `EmailSummary`/`EmailDetail` shape (`lib/gmail/types.ts`). Email `id` is
  the IMAP UID (stable within the mailbox).
- `app/api/emails/route.ts`, `app/api/emails/[id]/route.ts` — JSON endpoints
  backing the UI; also the intended integration point for other internal
  tools later (e.g. feeding the SDOC pipeline).
- `app/dashboard/emails/page.tsx` + `components/emails-table.tsx` — the UI:
  a table of emails, click a row to open full body + attachment list in a
  side sheet. Falls back to an inline "not connected yet" message if
  `GMAIL_APP_PASSWORD` isn't set, instead of crashing the page.

**One-time setup (nobody has done this yet — the feature has no live
credentials configured):**

1. Sign in to averisbot@gmail.com's own Google Account settings (whoever
   administers that mailbox does this once, directly in Gmail — not through
   this app).
2. Security → turn on **2-Step Verification** (required before Google will
   issue app passwords).
3. Security → **App passwords** → create one (name it e.g. "averis-dashboard")
   → copy the 16-character password.
4. Set in `.env.local` (and in the Vercel project's env vars for production):
   - `GMAIL_BOT_EMAIL=averisbot@gmail.com`
   - `GMAIL_APP_PASSWORD=<the 16-character password, spaces removed>`
5. That's it — no redirect URIs, no consent screen, nothing to run.

**Deferred / explicitly not done:**
- Attachment bytes aren't exposed via the API — filenames/sizes are listed,
  no download/preview yet.
- No pagination past the first 50 messages.
- Nothing here writes into `sdoc-hackathon-docker/`'s scoring pipeline; that
  remains a standalone reference dataset/server for the hackathon challenge.

## Feature: TikTok Live ("LiveBuddy")

**Goal:** watch a TikTok creator's live chat from inside the dashboard
(now the `/dashboard` home page), pick a viewer's comment to send to an AI
co-host ("LiveBuddy"), and get a short, speakable answer back — grounded in
free-text product notes and/or uploaded reference files — that the host
reads out loud on stream.

**Live chat** — pure TypeScript, connecting over TikTok's webcast protocol
with `tiktok-live-connector`. No TikTok API credentials needed; the
underlying library reverse-engineers TikTok's public LIVE websocket.
- `app/api/tiktok/live/route.ts` — `GET ?username=` — checks whether a user
  is currently live (`TikTokLiveConnection#fetchIsLive`).
- `app/api/tiktok/chat/route.ts` — `GET ?username=` — the streaming entry
  point. Opens a `TikTokLiveConnection`, relays `WebcastEvent.CHAT` /
  `ROOM_USER` / `STREAM_END` and `ControlEvent.DISCONNECTED` /
  `ERROR` out to the browser as Server-Sent Events.
- `lib/tiktok/map-chat.ts`, `lib/tiktok/types.ts`, `lib/tiktok/username.ts` —
  payload normalization, shared `ChatMessage`/`StreamEvent` types, username
  parsing.
- `components/tiktok-chat-monitor.tsx` — subscribes via `EventSource`,
  groups consecutive messages per viewer into chat bubbles
  (`components/ui/bubble.tsx`, `message.tsx`, `marker.tsx`), and renders a
  "send" icon button next to each comment that pushes it to LiveBuddy. This
  is now `/dashboard`'s home page (`app/dashboard/page.tsx`) — the earlier
  separate `/dashboard/tiktok` route was removed.

**LiveBuddy AI panel** (`components/live-assistant.tsx`) — the right-hand
column. `useLiveAssistant()` owns: `exchanges` (question/answer pairs sent
so far), `products` (free-text notes, persisted to `localStorage`), and
`selectedFileIds` (which uploaded reference files apply to the *next*
question, in-memory only). Clicking a chat bubble's send button calls
`ask([message])`, which POSTs to `/api/assistant` and streams the reply
into that exchange via newline-delimited JSON (`lib/assistant/types.ts`:
`delta`/`done`/`error`).

Originally this called the Anthropic API directly. **Replaced with the
local WorkBuddy AI gateway** so answers actually come from WorkBuddy, not
Claude:
- WorkBuddy AI (the desktop app, `WorkBuddyAI.exe`) bundles a CLI
  ("CodeBuddy Code") that can run as a local HTTP gateway:
  `codebuddy --serve --port 8321` (after a one-time `codebuddy /login`),
  which prints an endpoint + bearer password. Full docs:
  https://www.workbuddy.ai/docs/cli/http-api — but verified directly
  against the running gateway since the docs don't cover the SSE event
  schema. Two endpoints matter and are *not* interchangeable:
  - `POST /api/v1/runs` (`{id, type: "message", payload: {text, attachments}}`)
    — a plain conversational turn. This is what we use.
  - `POST /api/v1/jobs` (`{prompt, cwd, ...}`) — spawns an autonomous
    **coding agent process** with filesystem access, defaulting `cwd` to
    wherever the CLI was invoked from. **Do not** wire untrusted chat input
    (e.g. TikTok viewer comments) into this endpoint — confirmed by testing
    that it really does spawn a real OS process against a real working
    directory, a prompt-injection/arbitrary-agentic-action risk for public
    chat input.
  - A run's reply only exists on `GET /api/v1/runs/:runId/stream` (SSE)
    while the run is in-flight; once it settles the gateway 404s
    (`RUN_NOT_FOUND`) if you fetch the stream afterward, and
    `GET /api/v1/runs/:runId` (poll) doesn't expose the result content,
    only `{ runId, active }`. So the stream must be opened immediately
    after the `POST`, not polled lazily. Event shape (undocumented,
    captured live): `event: message` →
    `data: {version, replyTo, status, content: {markdown}, agent: {...}}`,
    then `event: done`. Each `message` event carries the *full* answer so
    far, not a delta.
- `lib/workbuddy/client.ts` — `streamWorkBuddy({text, attachments})`: POSTs
  the run, immediately opens the SSE stream, and yields each
  full-answer-so-far snapshot. `askWorkBuddy()` is a thin wrapper that just
  returns the last snapshot. `lib/workbuddy/config.ts` reads
  `WORKBUDDY_API_URL`/`WORKBUDDY_API_TOKEN`; if unset, callers get a typed
  `WorkBuddyNotConfiguredError` instead of a crash.
- `app/api/assistant/route.ts` — `POST {products, comment: {nickname, text},
  fileIds?}`. Requires a signed-in Supabase user (streams back
  `{type:"error", message:"Not signed in."}` otherwise, same wire format as
  any other failure — no special-casing in the client). Resolves `fileIds`
  via `lib/tiktok/resolve-attachments.ts`, folds the system prompt +
  product notes + viewer comment into one `text` (WorkBuddy's API has no
  separate system-message field), diffs each `streamWorkBuddy()` snapshot
  against the previous one to turn it back into `delta` chunks (so the
  existing append-only NDJSON protocol and frontend didn't need to change
  shape), and emits `done`/`error` as before.

**Reference files** — uploaded once, Supabase-backed, reusable across
sessions instead of re-uploading every time. Browsable directly inside the
LiveBuddy panel (`ReferenceFilesField` in `live-assistant.tsx`, under the
"Product notes" textarea) — not a separate page section.
- `supabase/migrations/20261010_tiktok_reference_files.sql` — table
  `tiktok_reference_files` (RLS: owner-only) + a **private** Storage bucket
  `tiktok-reference-files`. No Supabase CLI is wired up in this repo (no
  `supabase/config.toml`, no project link) — run this migration by pasting
  it into the Supabase project's SQL editor.
- `lib/tiktok/reference-files.ts` — shared bucket/table name constants,
  `ReferenceFile` type (client-safe — no server-only imports), 20MB upload
  cap, content-type → WorkBuddy attachment `type` mapping
  (`image`/`video`/`file`).
- `lib/tiktok/resolve-attachments.ts` — `server-only`; turns a user's
  selected file ids into signed-URL `WorkBuddyAttachment[]`, used by
  `app/api/assistant`. Ignores ids that don't belong to the caller instead
  of erroring (a stale selection shouldn't block answering).
- `app/api/tiktok/files/route.ts` (`GET` list, `POST` upload) and
  `app/api/tiktok/files/[id]/route.ts` (`DELETE`) — all storage/table access
  goes through `lib/supabase/admin.ts`'s service-role client (bucket is
  private; RLS policy is a backstop, not the actual access path), scoped to
  `auth.getUser()`'s id taken from the normal cookie session.

**One-time setup (nobody has done this yet):**
1. Run the migration SQL above in the Supabase project's SQL editor, and
   set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (Project Settings → API
   → `service_role` key — **never** expose this to the client).
2. On the machine that should answer questions: `codebuddy /login` once
   (interactive), then keep `codebuddy --serve --port 8321` running. Set
   `WORKBUDDY_API_URL`/`WORKBUDDY_API_TOKEN` in `.env.local` from its
   printed output. This is a local gateway (`127.0.0.1`) tied to one
   machine's logged-in WorkBuddy session — it is not something Vercel's
   production deployment can reach, so answering only works when run
   alongside a live `codebuddy --serve` process (e.g. locally, or from a
   machine that's reachable at `WORKBUDDY_API_URL`).

**Deferred / explicitly not done:**
- `ANTHROPIC_API_KEY`/`@anthropic-ai/sdk` are no longer used by this route
  (left in `package.json` from the pre-WorkBuddy version; harmless if
  unused, but worth removing in a cleanup pass if nothing else needs them).
- No retry/backoff if the WorkBuddy gateway is mid-restart.
- No way to edit an uploaded file's name/description after upload.
- The `/dashboard/*` auth-middleware gap noted in the Emails section above
  also applies here — these API routes check `auth.getUser()` themselves,
  but the *page* isn't gated by middleware.

## Changelog

- 2026-10-10 — A teammate merged in a full rebuild of the TikTok Live page
  as "LiveBuddy": chat bubbles (`components/ui/bubble.tsx`, `message.tsx`,
  `marker.tsx`), `components/live-assistant.tsx`
  (`useLiveAssistant`/`LiveAssistantPanel`), `app/api/assistant/route.ts`,
  moved onto `/dashboard` itself and dropped the separate `/dashboard/tiktok`
  route. That version answered via the Anthropic API directly
  (`@anthropic-ai/sdk`, `ANTHROPIC_API_KEY`). Rewired `/api/assistant` to
  call the local WorkBuddy gateway instead (`lib/workbuddy/client.ts`,
  already built and verified against a live gateway earlier the same day —
  see the `/jobs`-vs-`/runs` note above), and moved the reference-files
  upload/browse UI from a standalone page section into the LiveBuddy panel
  itself (`ReferenceFilesField` in `live-assistant.tsx`). Deleted the
  now-superseded `components/tiktok-dashboard.tsx`,
  `components/tiktok-reference-files.tsx`, and `app/api/tiktok/answer` from
  the pre-merge version of this feature; `app/api/tiktok/files(+[id])` and
  the Supabase migration survived unchanged and are reused by the new UI.
- 2026-09-19 — Replaced the Gmail OAuth2/refresh-token integration with
  IMAP + app password (`imapflow`/`mailparser`) at the user's request — no
  interactive Google login should exist anywhere in the system, not even a
  one-time admin bootstrap. Deleted `lib/gmail/auth.ts` and the
  `/api/gmail/oauth(+/callback)` routes entirely; rewrote `lib/gmail/client.ts`
  around IMAP. `.env`/`.env.example` now only need `GMAIL_BOT_EMAIL` +
  `GMAIL_APP_PASSWORD`.
- 2026-09-19 — Added the Emails sidebar section end-to-end: Gmail
  integration (`lib/gmail/*`), `/api/emails(+[id])`, `/dashboard/emails`
  page + table UI, sidebar nav entry, `app/dashboard` layout split out for
  reuse across dashboard pages. Created this file.
