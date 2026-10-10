import "server-only"
import mammoth from "mammoth"
import { referenceFileKind } from "@/lib/tiktok/reference-files"

export class ExtractTextError extends Error {}

// Pulls plain text out of an uploaded reference file so it can be chunked
// and embedded. Only the kinds referenceFileKind() accepts reach here.
export async function extractText(fileName: string, buffer: Buffer): Promise<string> {
  switch (referenceFileKind(fileName)) {
    case "text":
      return buffer.toString("utf8")
    case "docx": {
      const { value } = await mammoth.extractRawText({ buffer })
      return value
    }
    case "pdf": {
      const { PDFParse } = await import("pdf-parse")
      const parser = new PDFParse({ data: buffer })
      try {
        const { text } = await parser.getText()
        return text
      } finally {
        await parser.destroy()
      }
    }
    default:
      throw new ExtractTextError(`${fileName} isn't a supported file type.`)
  }
}
