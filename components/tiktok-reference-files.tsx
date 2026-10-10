"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon, Doc01Icon, Pdf01Icon, Txt01Icon, Upload04Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Marker, MarkerContent } from "@/components/ui/marker"
import {
  MAX_REFERENCE_FILE_BYTES,
  REFERENCE_FILE_ACCEPT,
  referenceFileKind,
  type ReferenceFile,
} from "@/lib/tiktok/reference-files"

const KIND_ICON = { pdf: Pdf01Icon, docx: Doc01Icon, text: Txt01Icon }

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type LoadState = { kind: "loading" } | { kind: "signed-out" } | { kind: "ready" }

// The "Context" window: everything the bot knows about what the host is
// selling — typed notes plus uploaded text / PDF / Word files.
export function TikTokReferenceFiles({
  selectedFileIds,
  onSelectedFileIdsChange,
  products,
  onProductsChange,
  className,
}: {
  selectedFileIds: string[]
  onSelectedFileIdsChange: (ids: string[]) => void
  products: string
  onProductsChange: (value: string) => void
  className?: string
}) {
  const [files, setFiles] = React.useState<ReferenceFile[]>([])
  const [load, setLoad] = React.useState<LoadState>({ kind: "loading" })
  const [uploading, setUploading] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/tiktok/files")
        const body = await res.json().catch(() => null)
        if (cancelled) return
        if (res.status === 401) return setLoad({ kind: "signed-out" })
        if (!res.ok || !body) {
          setError(body?.error ?? "Could not load your files.")
          return setLoad({ kind: "ready" })
        }
        const loaded: ReferenceFile[] = body.files
        setFiles(loaded)
        // Uploaded context is meant to be used: start with everything ticked.
        onSelectedFileIdsChange(loaded.map((f) => f.id))
        setLoad({ kind: "ready" })
      } catch {
        if (cancelled) return
        setError("Network error while loading your files.")
        setLoad({ kind: "ready" })
      }
    })()
    return () => {
      cancelled = true
    }
    // Load once on mount; the setter identity doesn't matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle(id: string, checked: boolean) {
    onSelectedFileIdsChange(checked ? [...selectedFileIds, id] : selectedFileIds.filter((f) => f !== id))
  }

  async function upload(picked: File[]) {
    if (picked.length === 0) return
    setUploading(true)
    setError(null)

    const added: ReferenceFile[] = []
    for (const file of picked) {
      if (!referenceFileKind(file.name)) {
        setError(`${file.name}: only text, PDF and Word (.docx) files are supported.`)
        continue
      }
      if (file.size > MAX_REFERENCE_FILE_BYTES) {
        setError(`${file.name} is over the ${MAX_REFERENCE_FILE_BYTES / (1024 * 1024)}MB limit.`)
        continue
      }
      try {
        const form = new FormData()
        form.set("file", file)
        const res = await fetch("/api/tiktok/files", { method: "POST", body: form })
        const body = await res.json().catch(() => null)
        if (res.status === 401) {
          setLoad({ kind: "signed-out" })
          break
        }
        if (!res.ok || !body) {
          setError(body?.error ?? `Could not upload ${file.name}.`)
          continue
        }
        added.push(body.file)
      } catch {
        setError(`Network error while uploading ${file.name}.`)
      }
    }

    if (added.length > 0) {
      setFiles((prev) => [...added, ...prev])
      onSelectedFileIdsChange([...selectedFileIds, ...added.map((f) => f.id)])
    }
    setUploading(false)
  }

  async function onDelete(id: string) {
    const prev = files
    setFiles((p) => p.filter((f) => f.id !== id))
    onSelectedFileIdsChange(selectedFileIds.filter((f) => f !== id))

    const res = await fetch(`/api/tiktok/files/${id}`, { method: "DELETE" }).catch(() => null)
    if (!res?.ok) {
      setFiles(prev)
      const body = await res?.json().catch(() => null)
      setError(body?.error ?? "Could not delete file.")
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Context</CardTitle>
        <CardDescription>What you&apos;re selling. LiveBuddy answers from this.</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Product notes</span>
          <textarea
            value={products}
            onChange={(e) => onProductsChange(e.target.value)}
            rows={5}
            placeholder="Names, prices, sizes, stock, promos, shipping…"
            className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </label>

        <div className="flex min-h-0 flex-col gap-2">
          <span className="text-sm font-medium">Files</span>

          {load.kind === "signed-out" ? (
            <Marker>
              <MarkerContent>
                <a href="/auth/login">Sign in</a> to upload product sheets, price lists or scripts.
              </MarkerContent>
            </Marker>
          ) : (
            <>
              <button
                type="button"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  void upload(Array.from(e.dataTransfer.files))
                }}
                data-dragging={dragging || undefined}
                className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-input px-3 py-5 text-center text-sm text-muted-foreground transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 data-dragging:border-ring data-dragging:bg-muted/50"
              >
                <HugeiconsIcon icon={Upload04Icon} strokeWidth={2} className="size-5" />
                <span className="font-medium text-foreground">{uploading ? "Uploading…" : "Upload or drop files"}</span>
                <span className="text-xs">Text, PDF or Word (.docx), up to 20MB each</span>
              </button>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={REFERENCE_FILE_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? [])
                  e.target.value = ""
                  void upload(picked)
                }}
              />

              {error && <p className="text-sm text-destructive">{error}</p>}

              {load.kind === "loading" ? (
                <Marker role="status">
                  <MarkerContent className="animate-pulse">Loading your files…</MarkerContent>
                </Marker>
              ) : files.length === 0 ? (
                <Marker>
                  <MarkerContent>No files yet.</MarkerContent>
                </Marker>
              ) : (
                <ul className="flex flex-col gap-1">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 rounded-md py-1.5 pr-1 pl-2 text-sm hover:bg-muted">
                      <Checkbox
                        id={`ref-file-${f.id}`}
                        checked={selectedFileIds.includes(f.id)}
                        onCheckedChange={(checked) => toggle(f.id, checked === true)}
                      />
                      <HugeiconsIcon
                        icon={KIND_ICON[referenceFileKind(f.fileName) ?? "text"]}
                        strokeWidth={2}
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                      <Label htmlFor={`ref-file-${f.id}`} className="min-w-0 flex-1 cursor-pointer" title={f.fileName}>
                        <span className="truncate">{f.fileName}</span>
                      </Label>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatSize(f.sizeBytes)}</span>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Remove ${f.fileName}`}
                        onClick={() => onDelete(f.id)}
                      >
                        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {files.length > 0 && (
                <p className="text-xs text-muted-foreground">Ticked files are sent to LiveBuddy with each comment.</p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
