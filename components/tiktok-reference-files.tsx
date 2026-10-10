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

// Product notes + reference-file browser/uploader: what LiveBuddy should
// know before answering the next comment. Files persist in Supabase (see
// /api/tiktok/files), so they don't need re-uploading next stream.
export function TikTokReferenceFiles({
  products,
  onProductsChange,
  selectedFileIds,
  onSelectedFileIdsChange,
  className,
}: {
  products: string
  onProductsChange: (value: string) => void
  selectedFileIds: string[]
  onSelectedFileIdsChange: (ids: string[]) => void
  className?: string
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

    const res = await fetch(`/api/tiktok/files/${id}`, { method: "DELETE" })
    if (!res.ok) {
      setFiles(prev)
      const body = await res.json().catch(() => null)
      setError(body?.error ?? "Could not delete file.")
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Reference</CardTitle>
        <CardDescription>What LiveBuddy knows before answering the next comment.</CardDescription>
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

        <div className="flex min-h-0 flex-1 flex-col gap-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">Reference files</span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Upload"}
            </Button>
            <input ref={inputRef} type="file" accept={REFERENCE_FILE_ACCEPT} className="hidden" onChange={onUpload} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-input">
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
        </div>
      </CardContent>
    </Card>
  )
}
