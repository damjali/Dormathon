"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { AiChat02Icon } from "@hugeicons/core-free-icons"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Marker, MarkerContent } from "@/components/ui/marker"
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from "@/components/ui/message"
import type { AssistantEvent } from "@/lib/assistant/types"
import type { ChatMessage } from "@/lib/tiktok/types"

export type Exchange = {
  id: string
  question: ChatMessage
  answer: string
  status: "pending" | "streaming" | "done" | "error"
  error?: string
}

const PRODUCTS_KEY = "livebuddy:products"

// crypto.randomUUID() only exists on https and localhost; on a plain-http
// host it's undefined and would crash the page. getRandomValues() works
// everywhere, so build the v4 UUID from that when needed.
function newSessionId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function useLiveAssistant() {
  // Reused as the Gateway Protocol message `id` on every call, which is
  // what keeps a conversation (including anything primed via
  // /api/tiktok/prime) in the same WorkBuddy session. See context.md.
  // Starts fresh on page load, and again every time primeContext() is
  // called — re-priming starts a clean session rather than mixing the new
  // file selection into whatever was said/primed before.
  const [sessionId, setSessionId] = React.useState(newSessionId)
  const [exchanges, setExchanges] = React.useState<Exchange[]>([])
  const [products, setProductsState] = React.useState("")
  const [selectedFileIds, setSelectedFileIds] = React.useState<string[]>([])

  React.useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
      setProductsState(localStorage.getItem(PRODUCTS_KEY) ?? "")
    } catch {}
  }, [])

  const setProducts = React.useCallback((value: string) => {
    setProductsState(value)
    try {
      localStorage.setItem(PRODUCTS_KEY, value)
    } catch {}
  }, [])

  const update = React.useCallback((id: string, patch: (e: Exchange) => Partial<Exchange>) => {
    setExchanges((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch(e) } : e)))
  }, [])

  const answerOne = React.useCallback(
    async (exchangeId: string, question: ChatMessage, productNotes: string) => {
      const fail = (error: string) => update(exchangeId, () => ({ status: "error", error }))
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            products: productNotes,
            comment: { nickname: question.nickname || question.uniqueId, text: question.comment },
          }),
        })
        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}))
          return fail(body.error ?? "AI request failed.")
        }

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ""
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += value
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.trim()) continue
            const event = JSON.parse(line) as AssistantEvent
            if (event.type === "delta") {
              update(exchangeId, (e) => ({ status: "streaming", answer: e.answer + event.text }))
            } else if (event.type === "done") {
              update(exchangeId, () => ({ status: "done" }))
            } else {
              fail(event.message)
            }
          }
        }
      } catch {
        fail("Network error while asking LiveBuddy.")
      }
    },
    [update, sessionId]
  )

  const ask = React.useCallback(
    (questions: ChatMessage[]) => {
      const created = questions.map<Exchange>((q) => ({
        id: `${q.id}:${Date.now()}`,
        question: q,
        answer: "",
        status: "pending",
      }))
      setExchanges((prev) => [...prev, ...created])
      for (const e of created) void answerOne(e.id, e.question, products)
    },
    [answerOne, products]
  )

  const clear = React.useCallback(() => setExchanges([]), [])

  // Starts a brand new session primed with exactly these files — not an
  // addition to whatever the old session already had in it. Clears the
  // transcript too, since those answers belonged to the old session's
  // context and would be misleading to leave sitting above a fresh one.
  const primeContext = React.useCallback(async (fileIds: string[]) => {
    const nextSessionId = newSessionId()
    const res = await fetch("/api/tiktok/prime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: nextSessionId, fileIds }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error ?? "Could not set context.")
    setSessionId(nextSessionId)
    setExchanges([])
    return body as { fileCount: number }
  }, [])

  return {
    sessionId,
    exchanges,
    products,
    setProducts,
    selectedFileIds,
    setSelectedFileIds,
    ask,
    clear,
    primeContext,
  }
}

export function LiveAssistantPanel({
  exchanges,
  onClear,
  className,
}: {
  exchanges: Exchange[]
  onClear: () => void
  className?: string
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const stickToBottom = React.useRef(true)

  React.useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [exchanges])

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>LiveBuddy AI</CardTitle>
        <CardDescription>Answers to the comments you sent, ready to read out on stream.</CardDescription>
        {exchanges.length > 0 && (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={onClear}>
              Clear
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1"
        >
          {exchanges.length === 0 ? (
            <Marker className="m-auto w-fit">
              <MarkerContent>Send a comment from the live chat and LiveBuddy will answer it here.</MarkerContent>
            </Marker>
          ) : (
            exchanges.map((e) => <ExchangeItem key={e.id} exchange={e} />)
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ExchangeItem({ exchange }: { exchange: Exchange }) {
  const { question, answer, status, error } = exchange
  const initials = (question.nickname || question.uniqueId || "?").slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col gap-2">
      <Message>
        <MessageAvatar>
          <Avatar>
            {question.avatarUrl && (
              <AvatarImage src={question.avatarUrl} alt={`@${question.uniqueId}`} referrerPolicy="no-referrer" />
            )}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </MessageAvatar>
        <MessageContent className="gap-1">
          <MessageHeader className="gap-1">
            <span className="text-foreground">{question.nickname}</span>
            {question.uniqueId && <span className="font-normal">@{question.uniqueId}</span>}
          </MessageHeader>
          <Bubble variant="muted">
            <BubbleContent>{question.comment}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>

      <Message align="end">
        <MessageAvatar>
          <Avatar>
            <AvatarFallback className="bg-primary text-primary-foreground">
              <HugeiconsIcon icon={AiChat02Icon} strokeWidth={2} className="size-4" />
            </AvatarFallback>
          </Avatar>
        </MessageAvatar>
        <MessageContent>
          {status === "pending" ? (
            <Marker role="status" className="w-fit">
              <MarkerContent className="animate-pulse">
                <span className="font-medium">LiveBuddy</span> is typing…
              </MarkerContent>
            </Marker>
          ) : (
            <>
              {answer && (
                <Bubble>
                  <BubbleContent>{answer}</BubbleContent>
                </Bubble>
              )}
              {status === "error" && (
                <Bubble variant="destructive">
                  <BubbleContent>{error}</BubbleContent>
                </Bubble>
              )}
            </>
          )}
          {status === "done" && <MessageFooter>Answered</MessageFooter>}
        </MessageContent>
      </Message>
    </div>
  )
}
