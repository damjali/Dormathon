import { randomUUID } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  MAX_REFERENCE_FILE_BYTES,
  REFERENCE_FILES_BUCKET,
  REFERENCE_FILES_TABLE,
  referenceFileKind,
  type ReferenceFile,
} from "@/lib/tiktok/reference-files"

export const dynamic = "force-dynamic"

// GET /api/tiktok/files -> reference files shared by everyone using this tool.
export async function GET() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from(REFERENCE_FILES_TABLE)
    .select("id, file_name, content_type, size_bytes, created_at")
    .order("created_at", { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const files: ReferenceFile[] = data.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  }))
  return Response.json({ files })
}

// POST /api/tiktok/files (multipart/form-data, field "file") -> uploads to
// the private bucket and records it so it can be re-selected without
// re-uploading next time.
export async function POST(request: Request) {
  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file" }, { status: 400 })
  }
  if (!referenceFileKind(file.name)) {
    return Response.json({ error: "Only text (.txt, .md), PDF and Word (.docx) files are supported" }, { status: 400 })
  }
  if (file.size === 0) {
    return Response.json({ error: "File is empty" }, { status: 400 })
  }
  if (file.size > MAX_REFERENCE_FILE_BYTES) {
    return Response.json(
      { error: `File exceeds the ${MAX_REFERENCE_FILE_BYTES / (1024 * 1024)}MB limit` },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const storagePath = `${randomUUID()}-${file.name}`

  const { error: uploadError } = await admin.storage
    .from(REFERENCE_FILES_BUCKET)
    .upload(storagePath, file, { contentType: file.type || undefined })
  if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 })

  const { data: row, error: insertError } = await admin
    .from(REFERENCE_FILES_TABLE)
    .insert({
      file_name: file.name,
      storage_path: storagePath,
      content_type: file.type || null,
      size_bytes: file.size,
    })
    .select("id, file_name, content_type, size_bytes, created_at")
    .single()

  if (insertError) {
    await admin.storage.from(REFERENCE_FILES_BUCKET).remove([storagePath])
    return Response.json({ error: insertError.message }, { status: 500 })
  }

  const result: ReferenceFile = {
    id: row.id,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  }
  return Response.json({ file: result }, { status: 201 })
}
