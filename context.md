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

## Changelog

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
