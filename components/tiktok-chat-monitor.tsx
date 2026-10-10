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

export function TikTokChatMonitor() {
  const [input, setInput] = React.useState("")
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" })
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [viewers, setViewers] = React.useState<number | null>(null)
  const sourceRef = React.useRef<EventSource | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const stickToBottom = React.useRef(true)
  const [selectedFileIds, setSelectedFileIds] = React.useState<string[]>([])
  const assistant = useLiveAssistant(selectedFileIds)
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
    // From xl up the three windows share one row that fills the viewport
    // below the app header; below that they stack and the page scrolls.
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6 xl:h-[calc(100svh-3.5rem)] xl:min-h-[640px] xl:flex-none">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">TikTok Live</h1>
          <p className="text-sm text-muted-foreground">
            Connect to a live stream, send viewer comments to LiveBuddy, and read out the answers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <form onSubmit={onSubmit} className="flex w-full gap-2 sm:w-auto sm:min-w-96">
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
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(18rem,24rem)] xl:grid-rows-[minmax(0,1fr)]">
        <Card className={PANEL_CLASS}>
          <CardHeader>
            <CardTitle>Live chat</CardTitle>
            <CardDescription>Press the send button next to a comment to have LiveBuddy answer it.</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              onScroll={(e) => {
                const el = e.currentTarget
                stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
              }}
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1"
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
          selectedFileIds={selectedFileIds}
          onSelectedFileIdsChange={setSelectedFileIds}
          products={assistant.products}
          onProductsChange={assistant.setProducts}
          selectedFileIds={assistant.selectedFileIds}
          onSelectedFileIdsChange={assistant.setSelectedFileIds}
          onClear={assistant.clear}
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
              <div key={m.id} className="flex w-full min-w-0 items-center gap-1">
                <Bubble variant={isAsked ? "tinted" : "muted"} className="max-w-[calc(100%-2.5rem)]">
                  <BubbleContent>{m.comment}</BubbleContent>
                </Bubble>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={isAsked}
                  onClick={() => onPush(m)}
                  aria-label={isAsked ? "Sent to LiveBuddy" : "Send to LiveBuddy"}
                  title={isAsked ? "Sent to LiveBuddy" : "Send to LiveBuddy"}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
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
