"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { ChatMessage, StreamEvent } from "@/lib/tiktok/types"

type Phase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "offline"; username: string }
  | { kind: "error"; message: string }
  | { kind: "connecting"; username: string }
  | { kind: "live"; username: string }
  | { kind: "ended"; username: string }

const MAX_MESSAGES = 500

type AnswerState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; answer: string }
  | { kind: "error"; message: string }

export function TikTokChatMonitor({ selectedFileIds = [] }: { selectedFileIds?: string[] }) {
  const [input, setInput] = React.useState("")
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" })
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [viewers, setViewers] = React.useState<number | null>(null)
  const sourceRef = React.useRef<EventSource | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const stickToBottom = React.useRef(true)
  const [answers, setAnswers] = React.useState<Record<string, AnswerState>>({})

  async function askWorkBuddy(message: ChatMessage) {
    setAnswers((prev) => ({ ...prev, [message.id]: { kind: "loading" } }))
    try {
      const res = await fetch("/api/tiktok/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: message.comment,
          nickname: message.nickname,
          uniqueId: message.uniqueId,
          fileIds: selectedFileIds,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setAnswers((prev) => ({ ...prev, [message.id]: { kind: "error", message: body.error ?? "Failed to get an answer." } }))
        return
      }
      setAnswers((prev) => ({ ...prev, [message.id]: { kind: "done", answer: body.answer } }))
    } catch {
      setAnswers((prev) => ({ ...prev, [message.id]: { kind: "error", message: "Network error." } }))
    }
  }

  const stopStream = React.useCallback(() => {
    sourceRef.current?.close()
    sourceRef.current = null
  }, [])

  React.useEffect(() => stopStream, [stopStream])

  React.useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  function startStream(username: string) {
    stopStream()
    setMessages([])
    setViewers(null)
    setPhase({ kind: "connecting", username })

    const source = new EventSource(`/api/tiktok/chat?username=${encodeURIComponent(username)}`)
    sourceRef.current = source

    source.onmessage = (e) => {
      const event = JSON.parse(e.data) as StreamEvent
      switch (event.type) {
        case "connected":
          setPhase({ kind: "live", username })
          break
        case "chat":
          setMessages((prev) => [...prev, event.message].slice(-MAX_MESSAGES))
          break
        case "viewers":
          setViewers(event.count)
          break
        case "offline":
          stopStream()
          setPhase({ kind: "offline", username })
          break
        case "ended":
          stopStream()
          setPhase({ kind: "ended", username })
          break
        case "error":
          stopStream()
          setPhase({ kind: "error", message: event.message })
          break
      }
    }
    // The server closes the stream on end/error; don't let EventSource auto-reconnect.
    source.onerror = () => {
      if (sourceRef.current !== source) return
      stopStream()
      setPhase((p) =>
        p.kind === "live"
          ? { kind: "ended", username }
          : p.kind === "connecting"
            ? { kind: "error", message: "Lost connection to the server." }
            : p
      )
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const username = input.trim().replace(/^@/, "").toLowerCase()
    if (!username) return

    stopStream()
    setMessages([])
    setViewers(null)
    setPhase({ kind: "checking" })

    try {
      const res = await fetch(`/api/tiktok/live?username=${encodeURIComponent(username)}`)
      const body = await res.json()
      if (!res.ok) {
        setPhase({ kind: "error", message: body.error ?? "Could not check this user." })
      } else if (body.isLive) {
        startStream(username)
      } else {
        setPhase({ kind: "offline", username })
      }
    } catch {
      setPhase({ kind: "error", message: "Network error while checking live status." })
    }
  }

  const busy = phase.kind === "checking" || phase.kind === "connecting"
  const streaming = phase.kind === "live" || phase.kind === "connecting"

  return (
    <div className="flex flex-1 flex-col gap-4">
      <form onSubmit={onSubmit} className="flex max-w-xl gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="TikTok username, e.g. @someone"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          {phase.kind === "checking" ? "Checking…" : "Search"}
        </Button>
        {streaming && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              stopStream()
              setPhase({ kind: "idle" })
            }}
          >
            Stop
          </Button>
        )}
      </form>

      <StatusLine phase={phase} viewers={viewers} />

      <Card className="flex min-h-[420px] flex-1 flex-col">
        <CardHeader>
          <CardTitle>Live chat</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget
              stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
            }}
            className="flex max-h-[60vh] min-h-[320px] flex-1 flex-col gap-2 overflow-y-auto"
          >
            {messages.length === 0 ? (
              <p className="m-auto text-sm text-muted-foreground">
                {phase.kind === "live"
                  ? "Connected. Waiting for chat messages…"
                  : "Search a username to see its live chat here."}
              </p>
            ) : (
              messages.map((m) => {
                const answer = answers[m.id] ?? { kind: "idle" as const }
                return (
                  <div key={m.id} className="flex flex-col gap-1">
                    <div className="flex items-start gap-2 text-sm">
                      {m.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.avatarUrl}
                          alt=""
                          className="size-6 shrink-0 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="size-6 shrink-0 rounded-full bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{m.nickname}</span>
                        {m.uniqueId && <span className="ml-1 text-xs text-muted-foreground">@{m.uniqueId}</span>}
                        <p className="break-words">{m.comment}</p>
                      </div>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="shrink-0"
                        disabled={answer.kind === "loading"}
                        onClick={() => askWorkBuddy(m)}
                      >
                        {answer.kind === "loading" ? "Asking…" : "Answer"}
                      </Button>
                    </div>
                    {answer.kind === "done" && (
                      <p className="ml-8 rounded-md bg-muted px-2 py-1.5 text-sm whitespace-pre-wrap">{answer.answer}</p>
                    )}
                    {answer.kind === "error" && (
                      <p className="ml-8 text-sm text-destructive">{answer.message}</p>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusLine({ phase, viewers }: { phase: Phase; viewers: number | null }) {
  switch (phase.kind) {
    case "idle":
      return null
    case "checking":
      return <p className="text-sm text-muted-foreground">Checking whether the user is live…</p>
    case "connecting":
      return <p className="text-sm text-muted-foreground">@{phase.username} is live. Connecting to chat…</p>
    case "live":
      return (
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="destructive">● LIVE</Badge>
          <span>@{phase.username}</span>
          {viewers !== null && <span className="text-muted-foreground">{viewers.toLocaleString()} viewers</span>}
        </div>
      )
    case "offline":
      return (
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary">Offline</Badge>
          <span>@{phase.username} is not live right now.</span>
        </div>
      )
    case "ended":
      return (
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="secondary">Ended</Badge>
          <span>The stream from @{phase.username} has ended.</span>
        </div>
      )
    case "error":
      return <p className="text-sm text-destructive">{phase.message}</p>
  }
}
