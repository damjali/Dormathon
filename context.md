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

## Feature: TikTok Live

**Goal:** watch a TikTok creator's live chat from inside the dashboard, and
let the operator forward any viewer's question to a local WorkBuddy AI
(CodeBuddy) instance for an answer, optionally grounded in reference files
(e.g. product docs) uploaded once and reused across streams.

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
  renders the chat + viewer count + connection status.

**WorkBuddy "Answer" integration** — WorkBuddy AI (the desktop app,
`WorkBuddyAI.exe`) bundles a CLI ("CodeBuddy Code") that can run as a local
HTTP gateway: `codebuddy --serve --port 8321` (after a one-time
`codebuddy /login`), which prints an endpoint + bearer password. Full docs:
https://www.workbuddy.ai/docs/cli/http-api — but verified directly against
the running gateway since the docs don't cover the SSE event schema. Two
endpoints matter and are *not* interchangeable:
- `POST /api/v1/runs` (`{id, type: "message", payload: {text, attachments}}`)
  — a plain conversational turn. This is what we use.
- `POST /api/v1/jobs` (`{prompt, cwd, ...}`) — spawns an autonomous
  **coding agent process** with filesystem access, defaulting `cwd` to
  wherever the CLI was invoked from. **Do not** wire untrusted chat input
  (e.g. TikTok viewer comments) into this endpoint — confirmed by testing
  that it really does spawn a real OS process against a real working
  directory, which is a prompt-injection/arbitrary-agentic-action risk for
  public chat input.
- A run's reply only exists on `GET /api/v1/runs/:runId/stream` (SSE) while
  the run is in-flight; once it settles the gateway 404s
  (`RUN_NOT_FOUND`) if you try to fetch the stream afterward, and
  `GET /api/v1/runs/:runId` (poll) doesn't expose the result content, only
  `{ runId, active }`. So the stream must be opened immediately after the
  `POST`, not polled lazily. Event shape (undocumented, captured live):
  `event: message` → `data: {version, replyTo, status, content: {markdown}, agent: {...}}`,
  then `event: done`.
- `lib/workbuddy/client.ts` — `askWorkBuddy({text, attachments})`: POSTs the
  run, immediately opens the SSE stream, and resolves with the final
  `content.markdown`. `lib/workbuddy/config.ts` reads
  `WORKBUDDY_API_URL`/`WORKBUDDY_API_TOKEN`; if unset, callers get a typed
  `WorkBuddyNotConfiguredError` instead of a crash.
- `app/api/tiktok/answer/route.ts` — `POST {comment, nickname?, uniqueId?,
  fileIds?}`. Requires a signed-in Supabase user. Resolves `fileIds` to
  this user's own reference files (ownership-checked), turns each into a
  15-minute Supabase Storage signed URL, and sends them as
  `payload.attachments` (`urlType: "url"`). Returns `{ answer }` or a 502/503
  with a human-readable error (not configured / gateway unreachable /
  gateway error).
- `components/tiktok-chat-monitor.tsx` — each chat message row has an
  "Answer" button; click → `POST /api/tiktok/answer` → inline answer (or
  error) rendered under that message. Per-message state, not global.

**Reference files** — uploaded once, Supabase-backed, reusable across
sessions instead of re-uploading every time:
- `supabase/migrations/20261010_tiktok_reference_files.sql` — table
  `tiktok_reference_files` (RLS: owner-only) + a **private** Storage bucket
  `tiktok-reference-files`. No Supabase CLI is wired up in this repo (no
  `supabase/config.toml`, no project link) — run this migration by pasting
  it into the Supabase project's SQL editor.
- `lib/tiktok/reference-files.ts` — shared bucket/table name constants,
  `ReferenceFile` type, 20MB upload cap, content-type → WorkBuddy attachment
  `type` mapping (`image`/`video`/`file`).
- `app/api/tiktok/files/route.ts` (`GET` list, `POST` upload) and
  `app/api/tiktok/files/[id]/route.ts` (`DELETE`) — all storage/table access
  goes through `lib/supabase/admin.ts`'s service-role client (bucket is
  private; RLS policy is a backstop, not the actual access path), scoped to
  `auth.getUser()`'s id taken from the normal cookie session.
- `components/tiktok-reference-files.tsx` — upload button, checkbox list to
  pick which files apply to the *next* "Answer" click, delete (×) per file.
- `components/tiktok-dashboard.tsx` — thin wrapper that owns the shared
  `selectedFileIds` state and renders the reference-files panel above the
  chat monitor; `app/dashboard/tiktok/page.tsx` renders this instead of
  `TikTokChatMonitor` directly now.

**One-time setup (nobody has done this yet):**
1. Run the migration SQL above in the Supabase project's SQL editor, and
   set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (Project Settings → API
   → `service_role` key — **never** expose this to the client).
2. On the machine that should answer questions: `codebuddy /login` once
   (interactive), then keep `codebuddy --serve --port 8321` running. Set
   `WORKBUDDY_API_URL`/`WORKBUDDY_API_TOKEN` in `.env.local` from its
   printed output. This is a local gateway (`127.0.0.1`) tied to one
   machine's logged-in WorkBuddy session — it is not something Vercel's
   production deployment can reach, so "Answer" only works when run
   alongside a live `codebuddy --serve` process (e.g. locally, or from a
   machine that's reachable at `WORKBUDDY_API_URL`).

**Deferred / explicitly not done:**
- No retry/backoff if the WorkBuddy gateway is mid-restart.
- No way to edit an uploaded file's name/description after upload, or to
  attach files to answers from anywhere other than the TikTok page.
- The `/dashboard/*` auth-middleware gap noted in the Emails section above
  also applies here — these API routes check `auth.getUser()` themselves,
  but the *page* isn't gated by middleware.

## Changelog

- 2026-10-10 — Added the WorkBuddy "Answer" integration and reusable
  reference-files section to TikTok Live: `lib/workbuddy/*`,
  `app/api/tiktok/answer`, `app/api/tiktok/files(+[id])`,
  `supabase/migrations/20261010_tiktok_reference_files.sql`,
  `components/tiktok-reference-files.tsx` + `tiktok-dashboard.tsx`. Verified
  the undocumented SSE schema and the `/jobs`-vs-`/runs` distinction against
  a live local gateway before wiring anything up (see Feature section
  above). Documented the pre-existing TikTok Live chat feature here too —
  it previously had no entry.
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
