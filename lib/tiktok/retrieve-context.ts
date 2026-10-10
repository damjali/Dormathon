import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { embedQuery } from "@/lib/tiktok/embeddings"

const MATCH_COUNT = 6
// Chunks below this similarity are more likely noise than signal — better to
// tell the model nothing than to hand it an unrelated paragraph.
const MIN_SIMILARITY = 0.3

type MatchedChunk = { content: string; similarity: number }

// Embeds the viewer's question and pulls the most relevant chunks from the
// host's selected reference files (or all files, if none are selected).
export async function retrieveContext(question: string, fileIds: string[]): Promise<string[]> {
  const admin = createAdminClient()
  const queryEmbedding = await embedQuery(question)

  const rpcArgs = {
    query_embedding: queryEmbedding,
    match_count: MATCH_COUNT,
    filter_file_ids: fileIds.length > 0 ? fileIds : null,
  }

  // Observed one cold-connection "fetch failed" on the first RPC call right
  // after a server restart, which a bare retry cleared immediately — worth
  // one retry rather than failing a whole answer over a transient blip.
  let { data, error } = await admin.rpc("match_reference_chunks", rpcArgs)
  if (error) ({ data, error } = await admin.rpc("match_reference_chunks", rpcArgs))
  if (error) throw new Error(`Vector search failed: ${error.message}`)

  return ((data ?? []) as MatchedChunk[])
    .filter((row) => row.similarity >= MIN_SIMILARITY)
    .map((row) => row.content)
}
