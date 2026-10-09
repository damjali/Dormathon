export type ChatMessage = {
  id: string
  userId: string
  uniqueId: string
  nickname: string
  avatarUrl?: string
  comment: string
  timestamp: number
}

// Events pushed over the SSE stream from /api/tiktok/chat
export type StreamEvent =
  | { type: "connected"; roomId: string }
  | { type: "chat"; message: ChatMessage }
  | { type: "viewers"; count: number }
  | { type: "offline"; reason: string }
  | { type: "ended" }
  | { type: "error"; message: string }
