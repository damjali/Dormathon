import "server-only"
import type Anthropic from "@anthropic-ai/sdk"
import mammoth from "mammoth"
import { createAdminClient } from "@/lib/supabase/admin"
import { REFERENCE_FILES_BUCKET, REFERENCE_FILES_TABLE, referenceFileKind } from "@/lib/tiktok/reference-files"

type DocumentBlock = Anthropic.Beta.BetaRequestDocumentBlock

// The API caps a request at 32MB and base64 inflates PDFs by a third.
const MAX_TOTAL_BYTES = 20 * 1024 * 1024

export class ContextFilesError extends Error {}

// Files are immutable once uploaded (a re-upload gets a new id), so the
// downloaded + converted block can be reused for every comment in a stream.
const blockCache = new Map<string, DocumentBlock>()
const BLOCK_CACHE_LIMIT = 32

// Turns the host's selected reference files into document blocks for the
// model. Only files owned by `userId` are used; unknown ids are ignored.
export async function loadContextDocuments(userId: string, fileIds: string[]): Promise<DocumentBlock[]> {
  if (fileIds.length === 0) return []

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from(REFERENCE_FILES_TABLE)
    .select("id, file_name, storage_path, size_bytes, user_id")
    .in("id", fileIds)
  if (error) throw new ContextFilesError(error.message)

  // Stable order keeps the request prefix identical across comments, which
  // is what lets the prompt cache hit.
  const owned = (rows ?? []).filter((row) => row.user_id === userId).sort((a, b) => a.id.localeCompare(b.id))

  const totalBytes = owned.reduce((sum, row) => sum + Number(row.size_bytes), 0)
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new ContextFilesError("The selected context files are too large together (20MB max). Untick some of them.")
  }

  return Promise.all(
    owned.map(async (row) => {
      const cached = blockCache.get(row.id)
      if (cached) return cached

      const { data: blob, error: downloadError } = await admin.storage
        .from(REFERENCE_FILES_BUCKET)
        .download(row.storage_path)
      if (downloadError || !blob) {
        throw new ContextFilesError(`Could not read ${row.file_name}.`)
      }
      const buffer = Buffer.from(await blob.arrayBuffer())

      const block = await toDocumentBlock(row.file_name, buffer)
      if (blockCache.size >= BLOCK_CACHE_LIMIT) blockCache.delete(blockCache.keys().next().value!)
      blockCache.set(row.id, block)
      return block
    })
  )
}

async function toDocumentBlock(fileName: string, buffer: Buffer): Promise<DocumentBlock> {
  switch (referenceFileKind(fileName)) {
    case "pdf":
      return {
        type: "document",
        title: fileName,
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      }
    case "docx": {
      const { value } = await mammoth.extractRawText({ buffer })
      return { type: "document", title: fileName, source: { type: "text", media_type: "text/plain", data: value } }
    }
    case "text":
      return {
        type: "document",
        title: fileName,
        source: { type: "text", media_type: "text/plain", data: buffer.toString("utf8") },
      }
    default:
      throw new ContextFilesError(`${fileName} isn't a supported file type.`)
  }
}
