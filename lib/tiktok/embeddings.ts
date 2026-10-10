import "server-only"
import { EmbeddingModel, FlagEmbedding } from "fastembed"

export const EMBEDDING_DIMENSIONS = 384 // AllMiniLML6V2 output size — must match the `vector(384)` column

// Loading the ONNX model takes ~30s the first time (one-time download +
// init); after that each embed() call is ~tens of ms. Keep one instance
// alive for the life of the server process instead of reloading per request.
let modelPromise: Promise<FlagEmbedding> | null = null
function getModel(): Promise<FlagEmbedding> {
  if (!modelPromise) modelPromise = FlagEmbedding.init({ model: EmbeddingModel.AllMiniLML6V2 })
  return modelPromise
}

// Embeds a batch of texts (e.g. a file's chunks at upload time).
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const model = await getModel()
  const out: number[][] = []
  for await (const batch of model.embed(texts)) {
    for (const vec of batch) out.push(Array.from(vec))
  }
  return out
}

// Embeds a single query (e.g. the viewer's question at ask time).
export async function embedQuery(text: string): Promise<number[]> {
  const model = await getModel()
  const vec = await model.queryEmbed(text)
  return Array.from(vec)
}
