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
(the `/dashboard` home page), pick a viewer's comment to send to an AI
co-host ("LiveBuddy"), and get a short, speakable answer back — grounded in
free-text product notes and/or uploaded reference files — that the host
reads out loud on stream. **No login anywhere in this feature** — removed
at explicit user request ("make sure there's no login, anyone can use this
system"); every reference file is a shared pool, not scoped per user.

**Live chat** — pure TypeScript, connecting over TikTok's webcast protocol
with `tiktok-live-connector`. No TikTok API credentials needed.
- `app/api/tiktok/live/route.ts` — `GET ?username=` — checks whether a user
  is currently live.
- `app/api/tiktok/chat/route.ts` — `GET ?username=` — streams
  `WebcastEvent.CHAT`/`ROOM_USER`/`STREAM_END` etc. to the browser as SSE.
- `lib/tiktok/map-chat.ts`, `types.ts`, `username.ts` — normalization,
  shared types, username parsing.
- `components/tiktok-chat-monitor.tsx` — subscribes via `EventSource`,
  groups messages into chat bubbles, and has a send button per comment that
  pushes it to LiveBuddy. This is `/dashboard`'s home page.

**LiveBuddy AI panel** (`components/live-assistant.tsx`) — `useLiveAssistant()`
owns `exchanges` (the Q&A transcript), `products` (free-text notes,
`localStorage`-persisted), `selectedFileIds` (which reference files are
checked right now), and — critically — **one `sessionId`
(`crypto.randomUUID()`) generated once per page load** and reused for every
WorkBuddy call made during that page's lifetime. `LiveAssistantPanel` is
just the transcript + Clear button; `components/tiktok-reference-files.tsx`
is a separate panel for product notes, the file browser/uploader, and the
"Set as context" button.

**WorkBuddy AI gateway** — WorkBuddy AI (desktop app, `WorkBuddyAI.exe`)
bundles a CLI ("CodeBuddy Code", npm package `@tencent-ai/codebuddy-code`,
command `codebuddy`) that runs as a local HTTP gateway:
`codebuddy --serve --port 8321` (after a one-time `codebuddy /login`),
printing an endpoint + bearer password shared with the desktop app's own
account/session (`~/.codebuddy/settings.json` — same credits balance as
the GUI app). Docs: https://www.workbuddy.ai/docs/cli/http-api, but several
things below were only discoverable by instrumenting a live gateway
(`--debug`, then reading `~/.codebuddy/logs/<date>/<project>.log` — the
docs don't cover any of this):

- `POST /api/v1/runs` (`{id, type: "message", payload: {text, attachments?}}`)
  is the only endpoint this app uses. **`POST /api/v1/jobs` must never be
  used with chat input** — it spawns an autonomous coding-agent OS process
  against a real `cwd`, confirmed by testing.
- **The `id` field doubles as the conversation/session id.** Reusing the
  same `id` across multiple `/api/v1/runs` calls keeps them in the same
  WorkBuddy session — same `agent.sessionId` comes back, and a fact stated
  in one call is correctly recalled in a later call with no re-statement
  needed (verified empirically: a value given in turn 1 was repeated back
  correctly, verbatim, in turn 2). A random/fresh `id` gets a fresh,
  isolated session. This is the whole mechanism the priming design below
  depends on.
- A run's reply only exists on `GET /api/v1/runs/:runId/stream` (SSE)
  while in-flight — it 404s (`RUN_NOT_FOUND`) once settled, and
  `GET /api/v1/runs/:runId` (poll) never exposes the content, only
  `{runId, active}`. Open the stream immediately after the `POST`.
  Event shape: `event: message` →
  `data: {version, replyTo, status, content: {markdown}, agent: {sessionId, toolCalls}}`,
  then `event: done`. Each `message` event carries the *full* answer so
  far, not a delta — `lib/workbuddy/client.ts`'s `streamWorkBuddy()` diffs
  successive snapshots itself so callers still get incremental chunks.
- **`payload.attachments` is unreliable and was the root cause of two
  separate severe-latency bugs, now both avoided entirely** (see Changelog
  for the full diagnosis):
  - `urlType: "url"` → the model calls its own `WebFetch` tool on the URL
    instead of reading it inline: ~20-30s added, every single question.
  - `urlType: "local-path"` → fast for a plain `.txt` file, but for a PDF
    the model instead calls `Read` then (confirmed via the debug log)
    **up to three separate `Bash` tool calls**, 30-50+ seconds total, and
    sometimes `finish_flag: "interrupt"` (outright failure) on an older,
    broken Electron-bundled copy of the CLI (the properly-installed
    `@tencent-ai/codebuddy-code` npm package doesn't have that specific
    hang, but still burns the same Bash-tool-call time for PDFs).
    **A coding agent with Bash access, auto-invoking shell commands against
    this project's own `cwd` in response to untrusted TikTok chat input, is
    a real risk — not just slow.** This is why attachments aren't used for
    reference-file content at all any more; see the priming design below.
- `lib/workbuddy/client.ts` — `streamWorkBuddy({text, attachments?, id?})`:
  POSTs the run (reusing `id` if given, else a fresh `randomUUID()`),
  opens the stream immediately, yields each full-answer snapshot.
  `askWorkBuddy()` wraps it for callers that just want the final answer.
  `lib/workbuddy/config.ts` reads `WORKBUDDY_API_URL`/`WORKBUDDY_API_TOKEN`;
  unset → typed `WorkBuddyNotConfiguredError`.

**Reference-file priming (replaces attachments/RAG entirely — no embeddings,
no chunking, no vector search)**: the host checks files in the reference
panel, clicks **"Set as context,"** and the *exact, full* text of those
files is sent once as a priming message into the page's `sessionId`. Every
question asked afterward in that same session reuses `sessionId`, so the
content is already there — no attachment, no tool call, just a normal fast
conversational turn (~2-5s, confirmed by testing, vs. 30-67s per question
with the old attachment approaches).
- `lib/tiktok/extract-text.ts` — `server-only`; plain text out of an
  uploaded file's bytes: `.txt`/`.md` as-is, `.docx` via `mammoth`, `.pdf`
  via `pdf-parse` v2's `PDFParse` class (`new PDFParse({data: buffer})` →
  `.getText()` — v2 is a ground-up rewrite, **not** the v1 default-export
  function API). `pdf-parse` must be in `next.config.ts`'s
  `serverExternalPackages` — Turbopack otherwise fails to resolve
  `pdfjs-dist`'s worker file (`Cannot find module '.../pdf.worker.mjs'`).
- `app/api/tiktok/prime/route.ts` — `POST {sessionId, fileIds}`: downloads
  each selected file from Storage, extracts its text, wraps each in
  `<file name="...">...</file>`, concatenates (capped at 60,000 chars —
  returns a 400 telling the host to select fewer files if exceeded), and
  sends one priming message via `askWorkBuddy({text, id: sessionId})`
  asking the model to just acknowledge, not answer yet.
- `app/api/assistant/route.ts` — `POST {sessionId, products, comment}`.
  No `fileIds`, no attachments — just folds the system prompt + product
  notes + viewer comment into one `text` and calls
  `streamWorkBuddy({text, id: sessionId})`. This is what makes real
  questions fast: all the expensive context-loading happened once, earlier,
  in the priming call.
- `components/tiktok-reference-files.tsx` — upload/browse/delete (unchanged
  from before) plus the "Set as context" button: disabled with no files
  checked, shows "Setting context…" while priming, "✓ N files set for this
  session" once done, and "Selection changed — set again to update" if the
  checked set no longer matches what was last primed.
- `supabase/migrations/20261010_tiktok_reference_files.sql` +
  `20261011_tiktok_reference_files_public.sql` — table
  `tiktok_reference_files` (now public — second migration drops the
  `user_id` FK/NOT NULL and opens RLS) + private Storage bucket
  `tiktok-reference-files`. No Supabase CLI wired up in this repo — run
  migrations via the SQL editor, in filename order. **No `tiktok_reference_chunks`
  table and no `vector` extension are used** — an embedding/RAG version of
  this was built and fully torn out again at the user's explicit request
  ("dont use embedding... use the exact files as context"); nothing from it
  remains in the schema or codebase.
- `lib/tiktok/reference-files.ts` — bucket/table constants, `ReferenceFile`
  type (client-safe), `referenceFileKind()`/`REFERENCE_FILE_ACCEPT`
  (`.txt`/`.md`/`.pdf`/`.docx` only — exactly what `extract-text.ts` can
  handle), 20MB upload cap.
- `app/api/tiktok/files/route.ts` (`GET` list, `POST` upload — just storage
  + a table row, no indexing of any kind) and `.../[id]/route.ts`
  (`DELETE`). All via `lib/supabase/admin.ts`'s service-role client.

**Dead ends found and removed, so they don't get rebuilt:**
- `lib/tiktok/resolve-attachments.ts` (signed-URL `url`-type attachments —
  the WebFetch-detour bug) and a local-folder `workspaceDirs`/
  `lib/workbuddy/product-docs.ts` mechanism (scans a hardcoded
  `workbuddy-product-docs/` folder and registers it via
  `POST /api/v1/workspace-dirs`) were both tried and both deleted. The
  workspace-dirs approach in particular doesn't fit the actual UX (picking
  *specific* uploaded files via the browser, not dropping files into a
  server-local folder) and still routes through the same slow/risky
  local-path-attachment path for PDFs. `lib/workbuddy/client.ts` no longer
  has any `workspace-dirs` code. The `workbuddy-product-docs/` folder
  itself (containing a user-dropped test PDF) was left alone on disk —
  unreferenced by any code now, but not this session's file to delete.
- The embedding/RAG version (`lib/tiktok/chunk-text.ts`, `embeddings.ts`
  (`fastembed`, local ONNX model, no API key), `index-file.ts`,
  `retrieve-context.ts`, a `match_reference_chunks` Postgres function) was
  fully built, tested, and working (3.5-5s answers, correctly grounded) —
  then removed completely per explicit instruction to use exact files, not
  embeddings. `fastembed`/`onnxruntime-node` are out of
  `serverExternalPackages` again; only `pdf-parse` remains (still needed
  for `extract-text.ts`). `mammoth`/`pdf-parse` stay in `package.json`.

**One-time setup:**
1. Run both `supabase/migrations/2026101*` SQL files (filename order) in
   the Supabase SQL editor, and set `SUPABASE_SERVICE_ROLE_KEY` in
   `.env.local`.
2. On the machine that should answer questions: `codebuddy /login` once
   (the bundled Electron-app copy of the CLI can't do this — its
   interactive/TUI code is missing from that build; install and use the
   real `@tencent-ai/codebuddy-code` npm package instead), then keep
   `codebuddy --serve --port 8321` (or any port) running. Set
   `WORKBUDDY_API_URL`/`WORKBUDDY_API_TOKEN` in `.env.local` from its
   printed output. Local-only (`127.0.0.1`) — not reachable from a Vercel
   deployment, so this only works run alongside a live `codebuddy --serve`
   process (locally, or from a machine reachable at `WORKBUDDY_API_URL`).

**Deferred / explicitly not done:**
- No auth anywhere in this feature, by design. Anyone who can reach
  `/dashboard` can upload/delete shared reference files and spend the
  WorkBuddy account's credits (same pool as the desktop app).
- `ANTHROPIC_API_KEY`/`@anthropic-ai/sdk` in `package.json` are leftover
  from a pre-WorkBuddy version of this route; unused, harmless, worth a
  cleanup pass.
- No retry/backoff if the WorkBuddy gateway is mid-restart (the priming
  call does get `askWorkBuddy`'s normal error handling, just no retry).
  `lib/tiktok/retrieve-context.ts` (deleted, was RAG-only) used to retry
  its Supabase RPC call once after observing a cold-connection failure —
  nothing in the current design makes an RPC call at question time, so
  that specific failure mode no longer applies.
- No way to edit an uploaded file's name/description after upload.
- No cap on how many files can be checked at once before "Set as context"
  — only a total-character cap (60k) enforced after extraction, which
  surfaces as a plain error rather than, say, graying out further
  checkboxes.
- The `/dashboard/*` auth-middleware gap noted in the Emails section above
  is moot for this feature specifically (nothing here ever checked auth)
  but the gap itself is still real for anything else that might rely on
  middleware-level gating.

## Changelog

- 2026-10-10 — Replaced reference-file context entirely with session
  priming, at explicit user request ("use the exact files as context...
  dont use embedding... make sure the file is being set as context at the
  initial start of the new session, so the question... replies instantly").
  Found this repo already had two half-built, uncommitted attempts at
  related ideas sitting on disk when this started: a restored (buggy)
  `url`-type attachment resolver, and a new `workspaceDirs`/
  `product-docs.ts` local-folder mechanism — neither matched the actual
  request, both deleted. Before building anything, verified the core
  mechanism empirically against a live gateway (reusing the Gateway
  Protocol `id` as a session id — confirmed via a same-id/different-id A/B
  test that a fact stated in one call is correctly recalled, verbatim, in
  a later call with the same id and not with a different one) and found,
  also empirically, that attaching a PDF via `local-path` makes the model
  burn 30-50+ seconds across up to three `Bash` tool calls per question —
  a real security concern (untrusted chat input reaching a Bash-capable
  coding agent against this project's own `cwd`), not just a latency one.
  That finding is what shaped the actual fix: extract file text ourselves
  (`lib/tiktok/extract-text.ts`) and prime the session with it directly as
  plain text (`app/api/tiktok/prime/route.ts`), never handing WorkBuddy a
  file reference at all. `useLiveAssistant()` now owns one `sessionId` per
  page load, reused as `id` on every `/api/assistant` call, which is the
  only reason priming-once-then-fast-questions works. Verified end-to-end:
  upload → prime (~6.5s) → two follow-up questions (2.1s, 4.4s), correctly
  grounded in the actual PDF content, zero tool calls.
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
