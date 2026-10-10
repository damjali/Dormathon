"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { ReferenceFile } from "@/lib/tiktok/reference-files"

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function TikTokReferenceFiles({
  selectedFileIds,
  onSelectedFileIdsChange,
}: {
  selectedFileIds: string[]
  onSelectedFileIdsChange: (ids: string[]) => void
}) {
  const [files, setFiles] = React.useState<ReferenceFile[] | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const refresh = React.useCallback(async () => {
    const res = await fetch("/api/tiktok/files")
    const body = await res.json()
    if (!res.ok) {
      setError(body.error ?? "Could not load reference files.")
      return
    }
    setFiles(body.files)
  }, [])

  React.useEffect(() => {
    refresh()
  }, [refresh])

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
    <Card>
      <CardHeader>
        <CardTitle>Reference files</CardTitle>
        <CardAction>
          <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? "Uploading…" : "Upload file"}
          </Button>
          <input ref={inputRef} type="file" className="hidden" onChange={onUpload} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Select which files WorkBuddy should reference when answering a viewer&apos;s question.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {files === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <Checkbox
                  id={`ref-file-${f.id}`}
                  checked={selectedFileIds.includes(f.id)}
                  onCheckedChange={(checked) => toggle(f.id, checked === true)}
                />
                <Label htmlFor={`ref-file-${f.id}`} className="min-w-0 flex-1 cursor-pointer truncate">
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
      </CardContent>
    </Card>
  )
}
