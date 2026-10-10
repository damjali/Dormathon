import "server-only"

import fs from "node:fs/promises"
import path from "node:path"
import { getWorkBuddyProductDocsDir } from "@/lib/workbuddy/config"
import type { WorkBuddyAttachment } from "@/lib/workbuddy/types"

const SUPPORTED_PRODUCT_DOC_EXTENSIONS = new Set([
  ".csv",
  ".doc",
  ".docx",
  ".json",
  ".md",
  ".pdf",
  ".txt",
  ".xlsx",
])

export type ProductDocsContext = {
  dir: string
  attachments: WorkBuddyAttachment[]
  files: string[]
}

export async function resolveLocalProductDocs(): Promise<ProductDocsContext> {
  const dir = getWorkBuddyProductDocsDir()
  const files = await listProductDocFiles(dir)

  return {
    dir,
    files,
    attachments: files.map((file) => ({
      type: "file",
      url: file,
      urlType: "local-path",
    })),
  }
}

async function listProductDocFiles(dir: string): Promise<string[]> {
  try {
    const stat = await fs.stat(dir)
    if (!stat.isDirectory()) return []
  } catch {
    return []
  }

  const found: string[] = []
  await walk(dir, found)
  return found.sort((a, b) => a.localeCompare(b))
}

async function walk(dir: string, found: string[]) {
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(fullPath, found)
    } else if (entry.isFile() && SUPPORTED_PRODUCT_DOC_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      found.push(fullPath)
    }
  }
}
