export type WorkBuddyAttachment = {
  type: "image" | "voice" | "video" | "file"
  url: string
  urlType: "local-path" | "url"
}

export type AskWorkBuddyParams = {
  text: string
  attachments?: WorkBuddyAttachment[]
  // Reused as the Gateway Protocol message `id`. The gateway maps this to
  // an internal conversation/session — passing the SAME id on later calls
  // continues that session (confirmed empirically; see context.md), so a
  // caller that wants a multi-turn conversation should generate one id
  // once and reuse it, rather than leaving this unset (which gets each
  // call a fresh random id, i.e. a fresh session, via randomUUID()).
  id?: string
}

export type AskWorkBuddyResult = {
  answer: string
}

// Shape of the SSE `message` event's `data` field from
// GET /api/v1/runs/:runId/stream, as observed from the live gateway.
export type WorkBuddyRunMessageEvent = {
  version: string
  replyTo: string
  status: string
  content?: { markdown?: string }
  agent?: { sessionId?: string; toolCalls?: unknown[] }
}
