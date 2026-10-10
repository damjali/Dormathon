"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { REFERENCE_FILE_ACCEPT, type ReferenceFile } from "@/lib/tiktok/reference-files"

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type PrimeState =
  | { kind: "idle" }
  | { kind: "priming" }
  | { kind: "done"; fileIds: string[] }
  | { kind: "error"; message: string }

function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const sorted = [...b].sort()
  return [...a].sort().every((id, i) => id === sorted[i])
}

// Product notes + reference-file browser/uploader: what LiveBuddy should
// know before answering the next comment. Files persist in Supabase (see
// /api/tiktok/files), so they don't need re-uploading next stream.
//
// "Set as context" starts a fresh WorkBuddy session primed with the EXACT
// text of the checked files (/api/tiktok/prime via onSetContext) — not
// added to whatever the old session had, not chunked/embedded. See
// context.md for why: WorkBuddy's own attachment/tool-reading path is both
// slow and, for the agent's Bash tool in particular, not something that
// should run against untrusted viewer chat input.
export function TikTokReferenceFiles({
  products,
  onProductsChange,
  selectedFileIds,
  onSelectedFileIdsChange,
  onSetContext,
  className,
}: {
  products: string
  onProductsChange: (value: string) => void
  selectedFileIds: string[]
  onSelectedFileIdsChange: (ids: string[]) => void
  onSetContext: (fileIds: string[]) => Promise<{ fileCount: number }>
  className?: string
}) {
  const [files, setFiles] = React.useState<ReferenceFile[] | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [primeState, setPrimeState] = React.useState<PrimeState>({ kind: "idle" })
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    fetch("/api/tiktok/files")
      .then((res) => res.json())
      .then((body) => setFiles(body.files ?? []))
      .catch(() => setError("Could not load reference files."))
  }, [])

  function toggle(id: string, checked: boolean) {
    onSelectedFileIdsChange(checked ? [...selectedFileIds, id] : selectedFileIds.filter((f) => f !== id))
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
      onSelectedFileIdsChange([...selectedFileIds, uploaded.id])
    } catch {
      setError("Network error while uploading.")
    } finally {
      setUploading(false)
    }
  }

  async function onDelete(id: string) {
    const prev = files
    setFiles((p) => p?.filter((f) => f.id !== id) ?? null)
    onSelectedFileIdsChange(selectedFileIds.filter((f) => f !== id))
    if (primeState.kind === "done" && primeState.fileIds.includes(id)) {
      setPrimeState({ kind: "idle" })
    }

    const res = await fetch(`/api/tiktok/files/${id}`, { method: "DELETE" })
    if (!res.ok) {
      setFiles(prev)
      const body = await res.json().catch(() => null)
      setError(body?.error ?? "Could not delete file.")
    }
  }

  async function setAsContext() {
    setPrimeState({ kind: "priming" })
    try {
      await onSetContext(selectedFileIds)
      setPrimeState({ kind: "done", fileIds: selectedFileIds })
    } catch (err) {
      setPrimeState({ kind: "error", message: err instanceof Error ? err.message : "Could not set context." })
    }
  }

  const isStale = primeState.kind === "done" && !sameIds(primeState.fileIds, selectedFileIds)

  return (
    <Card className={className}>
      <CardHeader className="flex h-[124px] min-h-[124px] shrink-0 flex-col justify-center gap-2 border-b border-[#e5e5e8] bg-[#f4f4f5] px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#161823] text-white shadow-sm shadow-black/10">
            <ReferenceIcon />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base font-semibold">Product context</CardTitle>
            <CardDescription className="mt-1 line-clamp-2 min-h-8 text-xs leading-4">
              Give LiveBuddy accurate details to use in its replies.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 pt-1">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-center justify-between font-medium">
            Product notes
            <span className="text-[10px] font-normal uppercase tracking-wider text-muted-foreground">Saved in this browser</span>
          </span>
          <textarea
            value={products}
            onChange={(e) => onProductsChange(e.target.value)}
            rows={3}
            placeholder="What you're selling today: names, prices, sizes, stock, promos, shipping…"
            className="w-full resize-y rounded-xl border border-[#e5e5e8] bg-[#f7f7f8] px-3 py-2.5 text-sm leading-5 outline-none transition-colors placeholder:text-muted-foreground/75 focus-visible:border-[#25c9c4]/55 focus-visible:bg-white focus-visible:ring-3 focus-visible:ring-[#25c9c4]/10"
          />
        </label>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-col">
              <span className="font-medium">Reference files</span>
              <span className="text-xs text-muted-foreground">PDF, Word, or text documents</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="shrink-0 rounded-xl border-[#161823] bg-[#161823] text-white hover:bg-[#252632] hover:text-white"
            >
              {uploading ? "Uploading…" : "Upload"}
            </Button>
            <input ref={inputRef} type="file" accept={REFERENCE_FILE_ACCEPT} className="hidden" onChange={onUpload} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[#e5e5e8] bg-[#f7f7f8]">
            {files === null ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">Loading reference files…</p>
            ) : files.length === 0 ? (
              <div className="flex h-full min-h-24 flex-col items-center justify-center px-4 py-5 text-center">
                <span className="mb-2 flex size-8 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-border">
                  <ReferenceIcon />
                </span>
                <p className="text-xs font-medium">No reference files yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Upload product details for more informed answers.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/70">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-muted/40">
                    <Checkbox
                      id={`ref-file-${f.id}`}
                      checked={selectedFileIds.includes(f.id)}
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

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={selectedFileIds.length === 0 || primeState.kind === "priming"}
              onClick={setAsContext}
            >
              {primeState.kind === "priming" ? "Setting context…" : "Set as context"}
            </Button>
            {primeState.kind === "done" && !isStale && (
              <span className="text-xs text-muted-foreground">
                ✓ {primeState.fileIds.length} file{primeState.fileIds.length === 1 ? "" : "s"} set for this session
              </span>
            )}
            {isStale && <span className="text-xs text-muted-foreground">Selection changed — set again to update</span>}
          </div>
          {primeState.kind === "error" && <p className="text-xs text-destructive">{primeState.message}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function ReferenceIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4">
      <path d="M13.5 3H6.75A1.75 1.75 0 0 0 5 4.75v14.5A1.75 1.75 0 0 0 6.75 21h10.5A1.75 1.75 0 0 0 19 19.25V8.5L13.5 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M13 3.5V9h5.5M8.5 13h7m-7 3.5h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
