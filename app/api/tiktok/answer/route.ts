import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { askWorkBuddy, WorkBuddyNotConfiguredError } from "@/lib/workbuddy/client"
import type { WorkBuddyAttachment } from "@/lib/workbuddy/types"
import { classifyTikTokComment } from "@/lib/tiktok/question-filter"
import { REFERENCE_FILES_BUCKET, REFERENCE_FILES_TABLE, workBuddyAttachmentType } from "@/lib/tiktok/reference-files"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  comment: z.string().min(1),
  nickname: z.string().optional(),
  uniqueId: z.string().optional(),
  fileIds: z.array(z.string().uuid()).optional(),
})

const SIGNED_URL_TTL_SECONDS = 15 * 60

// POST /api/tiktok/answer -> forwards a viewer's question (plus any selected
// reference files) to the local WorkBuddy gateway and returns its reply.
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 })
  }
  const { comment, nickname, uniqueId, fileIds } = parsed.data
  const filter = classifyTikTokComment(comment)
  if (!filter.isQuestion) {
    return Response.json({ error: `Comment filtered out: ${filter.reason}` }, { status: 422 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 })

  let attachments: WorkBuddyAttachment[] = []
  if (fileIds?.length) {
    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from(REFERENCE_FILES_TABLE)
      .select("storage_path, content_type, user_id")
      .in("id", fileIds)

    if (error) return Response.json({ error: error.message }, { status: 500 })

    const owned = (rows ?? []).filter((row) => row.user_id === user.id)
    attachments = await Promise.all(
      owned.map(async (row): Promise<WorkBuddyAttachment> => {
        const { data: signed, error: signError } = await admin.storage
          .from(REFERENCE_FILES_BUCKET)
          .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS)
        if (signError || !signed) throw new Error(signError?.message ?? "Could not sign file URL")
        return {
          type: workBuddyAttachmentType(row.content_type),
          url: signed.signedUrl,
          urlType: "url",
        }
      })
    )
  }

  const who = nickname ? `${nickname}${uniqueId ? ` (@${uniqueId})` : ""}` : uniqueId ? `@${uniqueId}` : "A viewer"
  const text = `${who} asked in the TikTok livestream chat: "${comment}"\n\nPlease answer their question.`

  try {
    const { answer } = await askWorkBuddy({ text, attachments })
    return Response.json({ answer })
  } catch (err) {
    if (err instanceof WorkBuddyNotConfiguredError) {
      return Response.json(
        { error: "WorkBuddy isn't configured. Set WORKBUDDY_API_URL and WORKBUDDY_API_TOKEN (see context.md)." },
        { status: 503 }
      )
    }
    const message = err instanceof Error ? err.message : "Failed to reach WorkBuddy"
    return Response.json({ error: message }, { status: 502 })
  }
}
