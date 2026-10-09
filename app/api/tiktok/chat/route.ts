import {
  ControlEvent,
  TikTokLiveConnection,
  UserOfflineError,
  WebcastEvent,
} from "tiktok-live-connector"
import { normalizeUsername } from "@/lib/tiktok/username"
import { mapChat } from "@/lib/tiktok/map-chat"
import type { StreamEvent } from "@/lib/tiktok/types"

export const dynamic = "force-dynamic"

// GET /api/tiktok/chat?username=foo -> Server-Sent Events stream of live chat.
export async function GET(request: Request) {
  const username = normalizeUsername(new URL(request.url).searchParams.get("username"))
  if (!username) {
    return Response.json({ error: "Invalid TikTok username" }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const connection = new TikTokLiveConnection(username, {})
  let closed = false
  const seen = new Set<string>() // TikTok replays recent history on connect

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: StreamEvent) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        } catch {
          closed = true
        }
      }

      const close = () => {
        if (closed) return
        closed = true
        connection.disconnect().catch(() => {})
        try {
          controller.close()
        } catch {}
      }

      // Keep proxies from timing out an idle connection.
      const heartbeat = setInterval(() => {
        if (closed) return clearInterval(heartbeat)
        try {
          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch {
          closed = true
        }
      }, 15000)

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat)
        close()
      })

      connection.on(WebcastEvent.CHAT, (data) => {
        const message = mapChat(data)
        if (!message || seen.has(message.id)) return
        seen.add(message.id)
        send({ type: "chat", message })
      })

      connection.on(WebcastEvent.ROOM_USER, (data) => {
        const count = Number((data as { viewerCount?: unknown }).viewerCount)
        if (Number.isFinite(count)) send({ type: "viewers", count })
      })

      connection.on(WebcastEvent.STREAM_END, () => {
        send({ type: "ended" })
        clearInterval(heartbeat)
        close()
      })

      connection.on(ControlEvent.DISCONNECTED, () => {
        if (closed) return
        send({ type: "ended" })
        clearInterval(heartbeat)
        close()
      })

      connection.on(ControlEvent.ERROR, ({ info }) => {
        console.error("[tiktok]", username, info)
      })

      connection
        .connect()
        .then((state) => send({ type: "connected", roomId: state.roomId }))
        .catch((err) => {
          if (err instanceof UserOfflineError) {
            send({ type: "offline", reason: `@${username} is not live right now.` })
          } else {
            console.error("[tiktok] connect failed", err)
            send({
              type: "error",
              message: err instanceof Error ? err.message : "Failed to connect to TikTok LIVE",
            })
          }
          clearInterval(heartbeat)
          close()
        })
    },
    cancel() {
      closed = true
      connection.disconnect().catch(() => {})
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
