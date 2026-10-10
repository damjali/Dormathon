"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { REFERENCE_FILE_ACCEPT, referenceFileKind, type ReferenceFile } from "@/lib/tiktok/reference-files"

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function PdfThumbnail({ fileId, fileName }: { fileId: string; fileName: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [previewError, setPreviewError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    let loadingTask: import("pdfjs-dist").PDFDocumentLoadingTask | undefined
    let renderTask: import("pdfjs-dist").RenderTask | undefined

    async function renderPreview() {
      try {
        const pdfjs = await import("pdfjs-dist")
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString()

        const response = await fetch(`/api/tiktok/files/${encodeURIComponent(fileId)}`)
        if (!response.ok) throw new Error(`PDF preview request failed (${response.status}).`)

        const data = new Uint8Array(await response.arrayBuffer())
        const documentTask = pdfjs.getDocument({ data })
        loadingTask = documentTask
        const pdf = await documentTask.promise
        if (cancelled) return

        const page = await pdf.getPage(1)
        const baseViewport = page.getViewport({ scale: 1 })
        const scale = Math.min(640 / baseViewport.width, 360 / baseViewport.height)
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        const context = canvas?.getContext("2d")
        if (!canvas || !context || cancelled) throw new Error("Could not render the PDF preview.")

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.ceil(viewport.width * pixelRatio)
        canvas.height = Math.ceil(viewport.height * pixelRatio)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        const pageRenderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        })
        renderTask = pageRenderTask
        await pageRenderTask.promise
      } catch (error) {
        if (!cancelled) {
          setPreviewError(error instanceof Error ? error.message : "Could not render the PDF preview.")
        }
      }
    }

    void renderPreview()
    return () => {
      cancelled = true
      renderTask?.cancel()
      void loadingTask?.destroy()
    }
  }, [fileId])

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-label={`First-page thumbnail of ${fileName}`}
        className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
      />
      {previewError && (
        <span
          role="img"
          aria-label="PDF preview unavailable"
          title={previewError}
          className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground"
        >
          Preview unavailable
        </span>
      )}
    </>
  )
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
      <CardHeader className="flex h-[92px] min-h-[92px] shrink-0 flex-col items-stretch justify-center gap-2 rounded-t-xl border-b border-[#25c9c4]/25 bg-gradient-to-r from-[#edfafa] via-[#f7fbfb] to-[#fff0f3] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#161823] text-white shadow-[3px_3px_0_#fe2c55,-3px_-3px_0_#25f4ee] transition-transform duration-200 group-hover/card:rotate-[-3deg]">
            <ReferenceIcon />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base font-bold tracking-tight">Product context</CardTitle>
            <CardDescription className="mt-0.5 truncate text-xs leading-4">
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
              className="shrink-0 rounded-xl border-[#161823] bg-[#161823] text-white transition-[background-color,transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-[#252632] hover:text-white hover:shadow-md active:translate-y-0"
            >
              {uploading ? "Uploading…" : "Upload"}
            </Button>
            <input ref={inputRef} type="file" accept={REFERENCE_FILE_ACCEPT} className="hidden" onChange={onUpload} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[#e5e5e8] bg-[#f7f7f8] p-2">
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
              <ul className="grid grid-cols-3 gap-2">
                {files.map((f) => (
                  <li key={f.id} className="group/file relative min-w-0 overflow-hidden rounded-lg border border-[#e5e5e8] bg-white shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[#25c9c4]/45 hover:shadow-md">
                    <div className="relative flex aspect-video items-center justify-center bg-[#ececef]">
                      {referenceFileKind(f.fileName) === "pdf" ? (
                        <PdfThumbnail fileId={f.id} fileName={f.fileName} />
                      ) : (
                        <span className="flex size-12 items-center justify-center rounded-xl bg-white text-[#555865] shadow-sm">
                          <ReferenceIcon className="size-6" />
                        </span>
                      )}
                      <span className="absolute bottom-2 left-2 rounded-md bg-[#161823]/85 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                        {referenceFileKind(f.fileName) ?? "file"}
                      </span>
                      <Checkbox
                        id={`ref-file-${f.id}`}
                        checked={selectedFileIds.includes(f.id)}
                        onCheckedChange={(checked) => toggle(f.id, checked === true)}
                        aria-label={`Select ${f.fileName}`}
                        className="absolute right-2 top-2 size-[18px] border-white bg-white/95 shadow-sm"
                      />
                    </div>
                    <div className="flex min-w-0 items-start justify-between gap-1.5 p-2">
                      <Label htmlFor={`ref-file-${f.id}`} className="min-w-0 flex-1 cursor-pointer">
                        <span className="line-clamp-2 text-xs font-medium leading-4 text-[#161823]" title={f.fileName}>
                          {f.fileName}
                        </span>
                        <span className="mt-1 block text-[10px] text-muted-foreground">{formatSize(f.sizeBytes)}</span>
                      </Label>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Remove ${f.fileName}`}
                        onClick={() => onDelete(f.id)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        ×
                      </Button>
                    </div>
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

function ReferenceIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={className ?? "size-4"}>
      <path d="M13.5 3H6.75A1.75 1.75 0 0 0 5 4.75v14.5A1.75 1.75 0 0 0 6.75 21h10.5A1.75 1.75 0 0 0 19 19.25V8.5L13.5 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M13 3.5V9h5.5M8.5 13h7m-7 3.5h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
