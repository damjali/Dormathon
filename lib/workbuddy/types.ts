export type WorkBuddyAttachment = {
  type: "image" | "voice" | "video" | "file"
  url: string
  urlType: "local-path" | "url"
}

export type AskWorkBuddyParams = {
  text: string
  attachments?: WorkBuddyAttachment[]
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
