"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { CheckmarkCircle02Icon, SentIcon } from "@hugeicons/core-free-icons"

import { LiveAssistantPanel, useLiveAssistant } from "@/components/live-assistant"
import { TikTokReferenceFiles } from "@/components/tiktok-reference-files"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Marker, MarkerContent } from "@/components/ui/marker"
import { Message, MessageAvatar, MessageContent, MessageHeader } from "@/components/ui/message"
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

// Shared sizing for the three side-by-side panels: fills the row in the xl
// 3-column layout, falls back to a sane min-height when stacked.
const PANEL_CLASS = "flex min-h-[420px] flex-col rounded-2xl shadow-sm xl:h-full xl:min-h-0"

export function TikTokChatMonitor() {
  const [input, setInput] = React.useState("")
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" })
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [viewers, setViewers] = React.useState<number | null>(null)
  const sourceRef = React.useRef<EventSource | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const stickToBottom = React.useRef(true)
  const assistant = useLiveAssistant()
  const asked = React.useMemo(() => new Set(assistant.exchanges.map((e) => e.question.id)), [assistant.exchanges])
  const { ask } = assistant
  const pushToBot = React.useCallback((m: ChatMessage) => ask([m]), [ask])

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
    <div className="flex flex-1 flex-col gap-5 bg-background p-4 sm:p-5 lg:gap-6 lg:px-7 lg:py-6 xl:h-[calc(100svh-3.5rem)] xl:min-h-[680px] xl:flex-none">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 rounded-[28px] border border-[#e5e5e8] bg-white px-5 py-6 shadow-sm sm:px-7 sm:py-7">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <Badge variant="secondary" className="mb-3 gap-2 rounded-full border border-[#fe2c55]/15 bg-[#fe2c55]/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#c91f45]">
              <span className={`size-1.5 rounded-full ${phase.kind === "live" ? "animate-pulse bg-[#fe2c55]" : "bg-[#70717b]/60"}`} />
              Live commerce workspace
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-[#161823] sm:text-4xl">TikTok Live</h1>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-[#686a75]">
              Follow the conversation, get help from LiveBuddy, and keep product details close at hand.
            </p>
          </div>
          <form onSubmit={onSubmit} className="flex w-full items-center gap-2 rounded-full border border-[#e5e5e8] bg-[#f5f5f6] p-2 shadow-sm sm:max-w-xl xl:max-w-lg">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="TikTok username, e.g. @someone"
              autoComplete="off"
              spellCheck={false}
              aria-label="TikTok username"
              className="h-10 rounded-full border-transparent bg-white shadow-none focus-visible:bg-white"
            />
            <Button type="submit" disabled={busy || !input.trim()} className="h-10 rounded-full bg-[#fe2c55] px-5 text-white shadow-sm hover:bg-[#e6254c]">
              {phase.kind === "checking" ? "Checking…" : phase.kind === "connecting" ? "Connecting…" : "Connect"}
            </Button>
            {streaming && (
              <Button type="button" variant="outline" className="h-10 rounded-full border-[#e5e5e8] bg-white px-4" onClick={() => {
                stopStream()
                setPhase({ kind: "idle" })
              }}>
                Stop
              </Button>
            )}
          </form>
        </div>
        <StatusLine phase={phase} viewers={viewers} />
      </div>

      <div className="mx-auto grid w-full max-w-[1800px] items-stretch gap-4 lg:grid-cols-2 xl:min-h-0 xl:flex-1 xl:grid-cols-3 xl:grid-rows-[minmax(0,1fr)]">
        <Card className={PANEL_CLASS}>
          <CardHeader className="flex h-[124px] min-h-[124px] shrink-0 flex-col justify-center gap-2 border-b border-[#fe2c55]/10 bg-[#fff6f7] px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#fe2c55] text-white shadow-sm shadow-[#fe2c55]/20">
                <ChatBubbleIcon />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base font-semibold">Live chat</CardTitle>
                <CardDescription className="mt-1 line-clamp-2 min-h-8 text-xs leading-4">Choose a comment to send it to LiveBuddy.</CardDescription>
              </div>
              <Badge variant="outline" className="ml-auto shrink-0 rounded-full border-[#d8d8dc] bg-white text-[10px] text-[#161823]">
                {messages.length} {messages.length === 1 ? "message" : "messages"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col pt-1">
            <div
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget
                stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
              }}
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-xl bg-[#f5f5f6] p-3 pr-2 sm:p-4"
            >
              {phase.kind === "live" && (
                <Marker variant="separator" role="status">
                  <MarkerContent>
                    Connected to <span className="font-medium text-foreground">@{phase.username}</span>
                  </MarkerContent>
                </Marker>
              )}
              {messages.length === 0 ? (
                phase.kind === "live" ? (
                  <Marker role="status" className="m-auto w-fit">
                    <MarkerContent className="animate-pulse">Waiting for chat messages…</MarkerContent>
                  </Marker>
                ) : (
                  <Marker className="m-auto w-fit">
                    <MarkerContent>Search a username to see its live chat here.</MarkerContent>
                  </Marker>
                )
              ) : (
                groupByAuthor(messages).map((group) => (
                  <ChatGroup key={group[0].id} group={group} asked={asked} onPush={pushToBot} />
                ))
              )}
              {(phase.kind === "ended" || phase.kind === "offline") && messages.length > 0 && (
                <Marker variant="separator" role="status">
                  <MarkerContent>Stream ended</MarkerContent>
                </Marker>
              )}
            </div>
          </CardContent>
        </Card>

        <LiveAssistantPanel exchanges={assistant.exchanges} onClear={assistant.clear} className={PANEL_CLASS} />

        <TikTokReferenceFiles
          products={assistant.products}
          onProductsChange={assistant.setProducts}
          selectedFileIds={assistant.selectedFileIds}
          onSelectedFileIdsChange={assistant.setSelectedFileIds}
          onSetContext={assistant.primeContext}
          className={PANEL_CLASS}
        />
      </div>
    </div>
  )
}

// Collapse consecutive messages from the same viewer into one avatar + bubble stack.
function groupByAuthor(messages: ChatMessage[]): ChatMessage[][] {
  const groups: ChatMessage[][] = []
  for (const m of messages) {
    const last = groups[groups.length - 1]
    if (last && last[0].userId === m.userId) last.push(m)
    else groups.push([m])
  }
  return groups
}

function ChatGroup({
  group,
  asked,
  onPush,
}: {
  group: ChatMessage[]
  asked: Set<string>
  onPush: (m: ChatMessage) => void
}) {
  const author = group[0]
  const initials = (author.nickname || author.uniqueId || "?").slice(0, 2).toUpperCase()

  return (
    <Message>
      <MessageAvatar>
        <Avatar>
          {author.avatarUrl && (
            <AvatarImage src={author.avatarUrl} alt={`@${author.uniqueId}`} referrerPolicy="no-referrer" />
          )}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent className="gap-1">
        <MessageHeader className="gap-1">
          <span className="text-foreground">{author.nickname}</span>
          {author.uniqueId && <span className="font-normal">@{author.uniqueId}</span>}
        </MessageHeader>
        <BubbleGroup>
          {group.map((m) => {
            const isAsked = asked.has(m.id)
            return (
              <div key={m.id} className="group/comment flex w-full min-w-0 items-center gap-1">
                <Bubble variant={isAsked ? "tinted" : "muted"} className="max-w-[calc(100%-2.5rem)]">
                  <BubbleContent className="rounded-2xl shadow-sm">{m.comment}</BubbleContent>
                </Bubble>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={isAsked}
                  onClick={() => onPush(m)}
                  aria-label={isAsked ? "Sent to LiveBuddy" : "Send to LiveBuddy"}
                  title={isAsked ? "Sent to LiveBuddy" : "Send to LiveBuddy"}
                  className="shrink-0 rounded-xl text-muted-foreground transition-colors group-hover/comment:bg-background group-hover/comment:text-foreground"
                >
                  <HugeiconsIcon icon={isAsked ? CheckmarkCircle02Icon : SentIcon} strokeWidth={2} />
                </Button>
              </div>
            )
          })}
        </BubbleGroup>
      </MessageContent>
    </Message>
  )
}

function StatusLine({ phase, viewers }: { phase: Phase; viewers: number | null }) {
  switch (phase.kind) {
    case "idle":
      return null
    case "checking":
      return (
        <div role="status" className="flex items-center gap-2 rounded-xl border bg-card px-3.5 py-2.5 text-sm text-muted-foreground shadow-sm">
          <span className="size-2 animate-pulse rounded-full bg-amber-500" />
          Checking whether the user is live…
        </div>
      )
    case "connecting":
      return (
        <div role="status" className="flex items-center gap-2 rounded-xl border bg-card px-3.5 py-2.5 text-sm text-muted-foreground shadow-sm">
          <span className="size-2 animate-pulse rounded-full bg-amber-500" />
          @{phase.username} is live. Connecting to chat…
        </div>
      )
    case "live":
      return (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 text-sm shadow-sm">
          <Badge variant="destructive" className="gap-1.5 rounded-full px-2.5">
            <span className="size-1.5 animate-pulse rounded-full bg-white" />
            LIVE
          </Badge>
          <span className="font-medium">@{phase.username}</span>
          {viewers !== null && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <ViewerIcon />
              {viewers.toLocaleString()} viewers
            </span>
          )}
        </div>
      )
    case "offline":
      return (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-amber-500/15 bg-amber-500/[0.035] px-3.5 py-2.5 text-sm">
          <Badge variant="secondary" className="rounded-full">Offline</Badge>
          <span className="text-muted-foreground">@{phase.username} is not live right now.</span>
        </div>
      )
    case "ended":
      return (
        <div role="status" className="flex items-center gap-2 rounded-xl border bg-muted/20 px-3.5 py-2.5 text-sm">
          <Badge variant="secondary" className="rounded-full">Ended</Badge>
          <span className="text-muted-foreground">The stream from @{phase.username} has ended.</span>
        </div>
      )
    case "error":
      return <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/[0.04] px-3.5 py-2.5 text-sm text-destructive">{phase.message}</p>
  }
}

function ViewerIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4">
      <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20m6-9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm6-6.5a3.5 3.5 0 0 1 0 6.8m1 3.2h.5a3.5 3.5 0 0 1 3.5 3.5V20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChatBubbleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4">
      <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.8-3.6A7.5 7.5 0 1 1 20 11.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 11.5h.01m4 0h.01m4 0h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
