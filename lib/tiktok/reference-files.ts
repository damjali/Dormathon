export const REFERENCE_FILES_BUCKET = "tiktok-reference-files"
export const REFERENCE_FILES_TABLE = "tiktok_reference_files"

// Keep uploads small — they're fetched over a signed URL by the WorkBuddy
// gateway on every "Answer" click, not stored for bulk/offline use.
export const MAX_REFERENCE_FILE_BYTES = 20 * 1024 * 1024 // 20MB

// What the host can upload as selling context: plain text, PDF, or Word.
// Legacy .doc isn't supported — it has to be saved as .docx first.
export const REFERENCE_FILE_ACCEPT = ".txt,.md,.pdf,.docx"

export type ReferenceFileKind = "text" | "pdf" | "docx"

export function referenceFileKind(fileName: string): ReferenceFileKind | null {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase()
  if (ext === "pdf") return "pdf"
  if (ext === "docx") return "docx"
  if (ext === "txt" || ext === "md") return "text"
  return null
}

export type ReferenceFile = {
  id: string
  fileName: string
  contentType: string | null
  sizeBytes: number
  createdAt: string
}

export function workBuddyAttachmentType(contentType: string | null): "image" | "video" | "file" {
  if (contentType?.startsWith("image/")) return "image"
  if (contentType?.startsWith("video/")) return "video"
  return "file"
}
