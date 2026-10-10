import { createAdminClient } from "@/lib/supabase/admin"
import { REFERENCE_FILES_BUCKET, REFERENCE_FILES_TABLE } from "@/lib/tiktok/reference-files"

export const dynamic = "force-dynamic"

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
