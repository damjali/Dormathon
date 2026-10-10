import { createAdminClient } from "@/lib/supabase/admin"
import {
  REFERENCE_FILES_BUCKET,
  REFERENCE_FILES_TABLE,
  referenceFileKind,
} from "@/lib/tiktok/reference-files"

export const dynamic = "force-dynamic"

// GET /api/tiktok/files/:id -> inline preview for supported PDF reference files.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const admin = createAdminClient()
  const { data: row, error: fetchError } = await admin
    .from(REFERENCE_FILES_TABLE)
    .select("file_name, storage_path")
    .eq("id", id)
    .single()

  if (fetchError || !row) return Response.json({ error: "File not found" }, { status: 404 })
  if (referenceFileKind(row.file_name) !== "pdf") {
    return Response.json({ error: "Preview is only available for PDF files" }, { status: 415 })
  }

  const { data: file, error: downloadError } = await admin.storage
    .from(REFERENCE_FILES_BUCKET)
    .download(row.storage_path)

  if (downloadError || !file) {
    return Response.json({ error: `Could not read PDF preview: ${downloadError?.message ?? "file unavailable"}` }, { status: 500 })
  }

  return new Response(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="reference-preview.pdf"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

// DELETE /api/tiktok/files/:id
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const admin = createAdminClient()
  const { data: row, error: fetchError } = await admin
    .from(REFERENCE_FILES_TABLE)
    .select("storage_path")
    .eq("id", id)
    .single()

  if (fetchError || !row) return Response.json({ error: "File not found" }, { status: 404 })

  await admin.storage.from(REFERENCE_FILES_BUCKET).remove([row.storage_path])
  const { error: deleteError } = await admin.from(REFERENCE_FILES_TABLE).delete().eq("id", id)
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 })

  return Response.json({ deleted: true })
}
