import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { extractText } from "@/lib/tiktok/extract-text"
import { chunkText } from "@/lib/tiktok/chunk-text"
import { embedTexts } from "@/lib/tiktok/embeddings"

const REFERENCE_CHUNKS_TABLE = "tiktok_reference_chunks"

// Extracts, chunks, and embeds an uploaded file's text, then stores the
// chunks for vector search (see match_reference_chunks in the migration).
// Runs once at upload time, not per-question.
export async function indexReferenceFile(fileId: string, fileName: string, buffer: Buffer) {
  const text = await extractText(fileName, buffer)
  const chunks = chunkText(text)
  if (chunks.length === 0) return

  const embeddings = await embedTexts(chunks)

  const admin = createAdminClient()
  const { error } = await admin.from(REFERENCE_CHUNKS_TABLE).insert(
    chunks.map((content, i) => ({
      file_id: fileId,
      chunk_index: i,
      content,
      embedding: embeddings[i],
    }))
  )
  if (error) throw new Error(`Failed to store chunks for ${fileName}: ${error.message}`)
}
