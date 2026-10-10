import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { extractText } from "@/lib/tiktok/extract-text"
import { REFERENCE_FILES_BUCKET, REFERENCE_FILES_TABLE } from "@/lib/tiktok/reference-files"
import { askWorkBuddy, WorkBuddyNotConfiguredError } from "@/lib/workbuddy/client"

export const dynamic = "force-dynamic"

// Keep the primed context well under the model's window — this is the
// EXACT text of the selected files, not a summary, so it needs a real cap.
const MAX_CONTEXT_CHARS = 60_000

const bodySchema = z.object({
  sessionId: z.string().min(1),
  fileIds: z.array(z.string().uuid()).min(1),
})

// POST /api/tiktok/prime -> sends the exact text of the selected reference
// files into the given WorkBuddy session once, so every question asked in
// that session afterward already has the context (fast, no per-question
// attachment/tool-call overhead — see context.md for why that matters).
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: "Invalid request body" }, { status: 400 })
  }
  const { sessionId, fileIds } = parsed.data

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from(REFERENCE_FILES_TABLE)
    .select("id, file_name, storage_path")
    .in("id", fileIds)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!rows || rows.length === 0) return Response.json({ error: "No matching files" }, { status: 404 })

  let sections: string
  try {
    const texts = await Promise.all(
      rows.map(async (row) => {
        const { data: blob, error: downloadError } = await admin.storage
          .from(REFERENCE_FILES_BUCKET)
          .download(row.storage_path)
        if (downloadError || !blob) throw new Error(`Could not read ${row.file_name}: ${downloadError?.message}`)
        const buffer = Buffer.from(await blob.arrayBuffer())
        const text = await extractText(row.file_name, buffer)
        return `<file name="${row.file_name.replace(/"/g, "'")}">\n${text.trim()}\n</file>`
      })
    )
    sections = texts.join("\n\n")
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read one of the selected files"
    return Response.json({ error: message }, { status: 500 })
  }

  if (sections.length > MAX_CONTEXT_CHARS) {
    return Response.json(
      { error: `Selected files total ${sections.length.toLocaleString()} characters, over the ${MAX_CONTEXT_CHARS.toLocaleString()} limit. Select fewer files.` },
      { status: 400 }
    )
  }

  const text = `You are LiveBuddy, a co-host assistant for a TikTok live shopping stream. The host just gave you the exact reference material below for this stream — use it, verbatim, as the source of truth for every question asked for the rest of this session. Don't summarize or answer anything yet, just confirm you're ready in one short sentence.

${sections}`

  try {
    await askWorkBuddy({ text, id: sessionId })
    return Response.json({ primed: true, fileCount: rows.length })
  } catch (err) {
    if (err instanceof WorkBuddyNotConfiguredError) {
      return Response.json(
        { error: "WorkBuddy isn't configured: set WORKBUDDY_API_URL and WORKBUDDY_API_TOKEN (see context.md)." },
        { status: 503 }
      )
    }
    const message = err instanceof Error ? err.message : "Failed to prime WorkBuddy"
    return Response.json({ error: message }, { status: 502 })
  }
}
