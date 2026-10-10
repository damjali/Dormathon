// Splits extracted text into overlapping chunks for embedding. Prefers
// paragraph boundaries so a chunk doesn't cut a sentence in half; falls back
// to a hard split for paragraphs longer than the target size on their own.
const CHUNK_SIZE = 800 // characters, not tokens — simple and good enough for Q&A-length reference docs
const CHUNK_OVERLAP = 150

export function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let current = ""

  const flush = () => {
    const trimmed = current.trim()
    if (trimmed) chunks.push(trimmed)
    current = ""
  }

  for (const para of paragraphs) {
    if (para.length > CHUNK_SIZE) {
      flush()
      for (let i = 0; i < para.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
        chunks.push(para.slice(i, i + CHUNK_SIZE).trim())
      }
      continue
    }

    if (current.length + para.length + 2 > CHUNK_SIZE) {
      flush()
      // Carry the tail of the previous chunk forward for overlap/context continuity.
      const prev = chunks[chunks.length - 1]
      current = prev ? prev.slice(-CHUNK_OVERLAP) + "\n\n" : ""
    }
    current += (current ? "\n\n" : "") + para
  }
  flush()

  return chunks.filter((c) => c.length > 0)
}
