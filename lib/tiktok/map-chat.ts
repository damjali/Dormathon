import type { ChatMessage } from "./types"

// The connector's typings and runtime payloads disagree between protocol
// versions (`comment` vs `content`, `uniqueId` vs `displayId`, ...), so read
// defensively instead of trusting a single shape.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapChat(data: any): ChatMessage | null {
  const comment = String(data?.comment ?? data?.content ?? "").trim()
  if (!comment) return null

  const user = data?.user ?? {}
  const uniqueId = String(user.uniqueId ?? user.displayId ?? "")
  const avatar = user.profilePicture ?? user.avatarThumb ?? user.avatarMedium
  const avatarUrl: string | undefined = avatar?.urlList?.[0] ?? avatar?.urls?.[0] ?? avatar?.mUrls?.[0] ?? avatar?.url_list?.[0]

  return {
    id: String(data?.common?.msgId ?? data?.msgId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
    userId: String(user.userId ?? user.id ?? ""),
    uniqueId,
    nickname: String(user.nickname || uniqueId || "unknown"),
    avatarUrl,
    comment,
    timestamp: Date.now(),
  }
}
