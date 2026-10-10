"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { AiChat02Icon } from "@hugeicons/core-free-icons"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Marker, MarkerContent } from "@/components/ui/marker"
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageHeader } from "@/components/ui/message"
import type { AssistantEvent } from "@/lib/assistant/types"
import type { ChatMessage } from "@/lib/tiktok/types"
import type { ReferenceFile } from "@/lib/tiktok/reference-files"

export type Exchange = {
  id: string
  question: ChatMessage
  answer: string
  status: "pending" | "streaming" | "done" | "error"
  error?: string
}

const PRODUCTS_KEY = "livebuddy:products"

export function useLiveAssistant() {
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
    async (exchangeId: string, question: ChatMessage, productNotes: string, fileIds: string[]) => {
      const fail = (error: string) => update(exchangeId, () => ({ status: "error", error }))
      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            products: productNotes,
            comment: { nickname: question.nickname || question.uniqueId, text: question.comment },
            fileIds,
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
    [update]
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
      for (const e of created) void answerOne(e.id, e.question, products, selectedFileIds)
    },
    [answerOne, products, selectedFileIds]
  )

  const clear = React.useCallback(() => setExchanges([]), [])

  return { exchanges, products, setProducts, selectedFileIds, setSelectedFileIds, ask, clear }
}

export function LiveAssistantPanel({
  exchanges,
  products,
  onProductsChange,
  selectedFileIds,
  onSelectedFileIdsChange,
  onClear,
}: {
  exchanges: Exchange[]
  products: string
  onProductsChange: (value: string) => void
  selectedFileIds: string[]
  onSelectedFileIdsChange: (ids: string[]) => void
  onClear: () => void
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const stickToBottom = React.useRef(true)

  React.useEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [exchanges])

  return (
    <Card className="flex h-[70svh] min-h-[480px] flex-col">
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
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Product notes</span>
          <textarea
            value={products}
            onChange={(e) => onProductsChange(e.target.value)}
            rows={3}
            placeholder="What you're selling today: names, prices, sizes, stock, promos, shipping…"
            className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </label>

        <ReferenceFilesField selected={selectedFileIds} onSelectedChange={onSelectedFileIdsChange} />

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

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Browse previously uploaded reference files (product sheets, price lists,
// photos…) or upload a new one, and pick which ones LiveBuddy should read
// before answering the next comment. Files persist in Supabase, so they
// don't need re-uploading next stream — see /api/tiktok/files.
function ReferenceFilesField({
  selected,
  onSelectedChange,
}: {
  selected: string[]
  onSelectedChange: (ids: string[]) => void
}) {
  const [files, setFiles] = React.useState<ReferenceFile[] | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    fetch("/api/tiktok/files")
      .then((res) => res.json())
      .then((body) => setFiles(body.files ?? []))
      .catch(() => setError("Could not load reference files."))
  }, [])

  function toggle(id: string, checked: boolean) {
    onSelectedChange(checked ? [...selected, id] : selected.filter((f) => f !== id))
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.set("file", file)
      const res = await fetch("/api/tiktok/files", { method: "POST", body: form })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Upload failed.")
        return
      }
      const uploaded: ReferenceFile = body.file
      setFiles((prev) => [uploaded, ...(prev ?? [])])
      onSelectedChange([...selected, uploaded.id])
    } catch {
      setError("Network error while uploading.")
    } finally {
      setUploading(false)
    }
  }

  async function onDelete(id: string) {
    const prev = files
    setFiles((p) => p?.filter((f) => f.id !== id) ?? null)
    onSelectedChange(selected.filter((f) => f !== id))

    const res = await fetch(`/api/tiktok/files/${id}`, { method: "DELETE" })
    if (!res.ok) {
      setFiles(prev)
      const body = await res.json().catch(() => null)
      setError(body?.error ?? "Could not delete file.")
    }
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">Reference files</span>
        <Button type="button" size="xs" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? "Uploading…" : "Upload"}
        </Button>
        <input ref={inputRef} type="file" className="hidden" onChange={onUpload} />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="max-h-32 overflow-y-auto rounded-lg border border-input">
        {files === null ? (
          <p className="px-2.5 py-2 text-xs text-muted-foreground">Loading…</p>
        ) : files.length === 0 ? (
          <p className="px-2.5 py-2 text-xs text-muted-foreground">No files uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-input">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 px-2 py-1.5">
                <Checkbox
                  id={`ref-file-${f.id}`}
                  checked={selected.includes(f.id)}
                  onCheckedChange={(checked) => toggle(f.id, checked === true)}
                />
                <Label htmlFor={`ref-file-${f.id}`} className="min-w-0 flex-1 cursor-pointer truncate font-normal">
                  {f.fileName}
                </Label>
                <span className="shrink-0 text-xs text-muted-foreground">{formatSize(f.sizeBytes)}</span>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remove ${f.fileName}`}
                  onClick={() => onDelete(f.id)}
                >
                  ×
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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
