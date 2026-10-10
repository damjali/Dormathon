import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { REFERENCE_FILES_BUCKET, REFERENCE_FILES_TABLE } from "@/lib/tiktok/reference-files"

export const dynamic = "force-dynamic"

// DELETE /api/tiktok/files/:id
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 })

  const admin = createAdminClient()
  const { data: row, error: fetchError } = await admin
    .from(REFERENCE_FILES_TABLE)
    .select("storage_path, user_id")
    .eq("id", id)
    .single()

  if (fetchError || !row) return Response.json({ error: "File not found" }, { status: 404 })
  if (row.user_id !== user.id) return Response.json({ error: "Not found" }, { status: 404 })

  await admin.storage.from(REFERENCE_FILES_BUCKET).remove([row.storage_path])
  const { error: deleteError } = await admin.from(REFERENCE_FILES_TABLE).delete().eq("id", id)
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 })

  return Response.json({ deleted: true })
}
