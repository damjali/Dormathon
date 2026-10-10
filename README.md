# LiveBuddy

LiveBuddy is an AI co-host for TikTok live sellers. It shows a stream's live chat, lets the host send any viewer comment to an AI with one click, and returns a short answer the host can read out loud. The AI answers from the host's own product notes and uploaded files.

## Try it

**Live site: http://136.85.7.231**

- Open it in any browser. It goes straight to the dashboard, and no sign-in is needed.
- Use `http://`, not `https://`. The site has no certificate yet, so the browser will show "Not secure".
- It runs on a Google Compute Engine VM (project `livebuddy-511213`, Singapore). The address is temporary: it changes if the VM is stopped and started, and the VM may be switched off after the hackathon. If the link doesn't load, ask the team for the current address.
- The site is open to anyone with the link. Don't upload files you wouldn't want others to see or delete.

To run it on your own machine instead, see [Getting started](#getting-started).

## Why

Live hosts rarely have time to study every product before going on air. Reading one comment, looking up the answer, and replying can take a minute or more, and during that time other viewers leave. LiveBuddy keeps the product knowledge in one place and drafts the answer, so the host only has to pick the comment and speak.

## How it works

The dashboard at `/dashboard` has three windows side by side:

| Window | What it does |
| --- | --- |
| **Live chat** | Shows the comments from a TikTok live stream as they arrive. Each comment has a send button. |
| **LiveBuddy AI** | Shows each comment you sent and the AI's answer, written as 1–3 spoken sentences. |
| **Reference** | Holds what the AI knows: free-text product notes and uploaded files. |

A typical session:

1. Type a TikTok username and press **Search**. If that account is live, the chat starts streaming.
2. Write product notes (names, prices, sizes, stock, promos, shipping), and upload any product sheets or price lists.
3. Tick the files that apply to this stream.
4. Press the send button next to a comment. The answer appears in the LiveBuddy AI window.

If the notes and files don't cover a question, the AI is told to say the host will confirm, rather than guess.

## Tech stack

- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS v4 with shadcn-style components built on Base UI
- `tiktok-live-connector` for the live chat (no TikTok API key needed)
- WorkBuddy AI, through its local CodeBuddy HTTP gateway, for the answers
- Supabase for file storage and for the login pages

## Getting started

### Requirements

- Node.js 20 or newer (developed on Node 22)
- pnpm
- A Supabase project
- WorkBuddy AI installed on the machine that will answer questions

### 1. Install

```bash
pnpm install
```

### 2. Set environment variables

Create a `.env` file in the project root:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
# Service-role key. Server-side only: never expose it to the browser.
SUPABASE_SERVICE_ROLE_KEY=

# WorkBuddy AI gateway
WORKBUDDY_API_URL=http://127.0.0.1:8321
WORKBUDDY_API_TOKEN=
```

### 3. Create the file storage

Run both SQL files in `supabase/migrations/` in your Supabase project's SQL editor, in date order. They create the `tiktok_reference_files` table and a private storage bucket called `tiktok-reference-files`. This repo has no Supabase CLI setup, so the SQL editor is the only way to apply them.

### 4. Start the WorkBuddy gateway

On the machine that will answer questions:

```bash
codebuddy /login                 # once
codebuddy --serve --port 8321    # keep this running
```

Copy the endpoint and password it prints into `WORKBUDDY_API_URL` and `WORKBUDDY_API_TOKEN`.

### 5. Run the app

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). It redirects to `/dashboard`.

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm build` | Build for production |
| `pnpm start` | Run the production build |
| `pnpm lint` | Run ESLint |

## Project structure

```
app/
  page.tsx                     Redirects / to /dashboard
  dashboard/                   LiveBuddy header and the three-window page
  auth/                        Login and signup pages, and their server actions
  api/
    tiktok/live/               GET: is this username live right now?
    tiktok/chat/               GET: live chat as a Server-Sent Events stream
    tiktok/files/              GET list, POST upload, DELETE /:id
    assistant/                 POST: answer one comment, streamed back
components/
  tiktok-chat-monitor.tsx      Page layout, username search, live chat window
  live-assistant.tsx           LiveBuddy AI window and the useLiveAssistant hook
  tiktok-reference-files.tsx   Reference window: product notes and files
  ui/                          Shared UI components (message, bubble, marker, card…)
lib/
  tiktok/                      Chat types, username parsing, file rules, attachments
  workbuddy/                   Client for the WorkBuddy gateway
  assistant/                   Event types for the answer stream
  supabase/                    Browser, server, and service-role clients
supabase/migrations/           SQL for the reference-files table and bucket
```

## API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/tiktok/live?username=` | GET | Returns `{ username, isLive }` |
| `/api/tiktok/chat?username=` | GET | Server-Sent Events: `connected`, `chat`, `viewers`, `offline`, `ended`, `error` |
| `/api/tiktok/files` | GET | Lists uploaded reference files |
| `/api/tiktok/files` | POST | Uploads one file (form field `file`) |
| `/api/tiktok/files/:id` | DELETE | Deletes a file |
| `/api/assistant` | POST | Body `{ products, comment: { nickname, text }, fileIds? }`. Returns newline-delimited JSON events: `delta`, `done`, `error` |

How an answer is produced:

1. The browser posts the comment, the product notes, and the ticked file ids to `/api/assistant`.
2. The server turns each file id into a signed URL that expires after 15 minutes.
3. It sends the instructions, notes, and comment to the WorkBuddy gateway as one message, with the files attached.
4. The gateway reports the full answer so far on each update. The server converts that into text chunks and streams them to the browser.

## Reference files

- Accepted types: `.txt`, `.md`, `.pdf`, `.docx`. Old-style `.doc` files must be saved as `.docx` first.
- Maximum size: 20MB per file.
- Files stay in Supabase between streams, so they only need uploading once.
- Files are shared by everyone who uses the app. They are not tied to a user account.
- Product notes are saved in the browser's local storage, so they stay on that one device.

## Limitations and known gaps

- **No access control.** `/dashboard` and every API route work without signing in. Anyone who can reach the app can read the chat, upload or delete files, and use the AI. Add auth before exposing it publicly.
- **The AI only works next to a running gateway.** WorkBuddy's gateway runs on one machine at `127.0.0.1`. A hosted deployment cannot reach it unless `WORKBUDDY_API_URL` points somewhere it can.
- **The TikTok connection is unofficial.** `tiktok-live-connector` relies on TikTok's public live websocket, which can change or rate-limit without notice.
- **Viewer comments are untrusted input.** They go only to the gateway's `/api/v1/runs` message endpoint. Do not route them to `/api/v1/jobs`, which starts a coding agent with file-system access.
- **Unfinished pieces in the repo:**
  - `lib/tiktok/question-filter.ts` classifies comments as product questions, but the UI does not use it yet.
  - `lib/gmail/` and `components/emails-table.tsx` belong to an email inbox feature whose pages and API routes are not in this repo.
  - `components/app-sidebar.tsx` and the other template components are unused.
  - `@anthropic-ai/sdk`, `mammoth`, and `pdf-parse` are installed but not imported anywhere.
- **Login pages are placeholders.** They still carry an earlier project name, and the "Login with Google" button is not connected.

## More detail

`context.md` holds the team's running design notes, including how the WorkBuddy gateway behaves. Parts of it describe earlier versions of the app; where it disagrees with the code, trust the code.
