import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import type { WorkBuddyAttachment } from "@/lib/workbuddy/types"
import { REFERENCE_FILES_BUCKET, REFERENCE_FILES_TABLE, workBuddyAttachmentType } from "@/lib/tiktok/reference-files"

const SIGNED_URL_TTL_SECONDS = 15 * 60

// Turns selected reference-file ids into WorkBuddy attachments (short-lived
// signed URLs into the private bucket). Files are shared across everyone
// using this tool, not scoped per user. Silently ignores ids that no longer
// exist instead of erroring, since a stale selection (e.g. a file deleted
// in another tab) shouldn't block answering.
export async function resolveWorkBuddyAttachments(fileIds: string[]): Promise<WorkBuddyAttachment[]> {
  if (fileIds.length === 0) return []

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from(REFERENCE_FILES_TABLE)
    .select("storage_path, content_type")
    .in("id", fileIds)
  if (error) throw new Error(error.message)

  return Promise.all(
    (rows ?? []).map(async (row): Promise<WorkBuddyAttachment> => {
      const { data: signed, error: signError } = await admin.storage
        .from(REFERENCE_FILES_BUCKET)
        .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS)
      if (signError || !signed) throw new Error(signError?.message ?? "Could not sign file URL")
      return { type: workBuddyAttachmentType(row.content_type), url: signed.signedUrl, urlType: "url" }
    })
  )
}
