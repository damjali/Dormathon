"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { AiChat02Icon } from "@hugeicons/core-free-icons"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

export function useLiveAssistant() {
  // Reused as the Gateway Protocol message `id` on every call, which is
  // what keeps a conversation (including anything primed via
  // /api/tiktok/prime) in the same WorkBuddy session. See context.md.
  // Starts fresh on page load, and again every time primeContext() is
  // called — re-priming starts a clean session rather than mixing the new
  // file selection into whatever was said/primed before.
  const [sessionId, setSessionId] = React.useState(() => crypto.randomUUID())
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
    const newSessionId = crypto.randomUUID()
    const res = await fetch("/api/tiktok/prime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: newSessionId, fileIds }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error ?? "Could not set context.")
    setSessionId(newSessionId)
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
      <CardHeader className="flex h-[124px] min-h-[124px] shrink-0 flex-col justify-center gap-2 border-b border-[#25c9c4]/20 bg-[#effcfb] px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#161823] text-white shadow-[2px_2px_0_#25f4ee,-2px_-2px_0_#fe2c55]">
            <HugeiconsIcon icon={AiChat02Icon} strokeWidth={2} className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <CardTitle className="shrink-0 text-base font-semibold">LiveBuddy AI</CardTitle>
              <span className="rounded-full border border-[#25c9c4]/30 bg-white px-2.5 py-1 text-[10px] font-medium text-[#146d6a]">
                Reply assistant
              </span>
              {exchanges.length > 0 && (
                <Button variant="ghost" size="sm" onClick={onClear} className="ml-auto h-8 shrink-0 px-2">
                  Clear
                </Button>
              )}
            </div>
            <CardDescription className="mt-1 line-clamp-2 min-h-8 text-xs leading-4">
              Answers to the comments you sent, ready to read out on stream.
            </CardDescription>
          </div>
        </div>
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
            <div className="m-auto flex max-w-xs flex-col items-center gap-3 px-5 py-8 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-[#25f4ee]/15 text-[#146d6a] ring-1 ring-[#25c9c4]/20">
                <HugeiconsIcon icon={AiChat02Icon} strokeWidth={1.8} className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium">Replies will show up here</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Select a viewer comment to get a response from LiveBuddy.
                </p>
              </div>
            </div>
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
            <AvatarFallback className="bg-[#000000] text-white">
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
                  <BubbleContent className="!bg-[#000000] !text-white">{answer}</BubbleContent>
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
