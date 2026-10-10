export const REFERENCE_FILES_BUCKET = "tiktok-reference-files"
export const REFERENCE_FILES_TABLE = "tiktok_reference_files"

// Keep uploads small — they're fetched over a signed URL by the WorkBuddy
// gateway on every "Answer" click, not stored for bulk/offline use.
export const MAX_REFERENCE_FILE_BYTES = 20 * 1024 * 1024 // 20MB

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
