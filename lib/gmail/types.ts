export interface EmailAttachment {
  filename: string
  mimeType: string
  size: number
}

export interface EmailSummary {
  id: string
  subject: string
  from: string
  to: string[]
  cc: string[]
  date: string
  snippet: string
  hasAttachments: boolean
}

export interface EmailDetail extends EmailSummary {
  bodyText: string
  bodyHtml: string | null
  attachments: EmailAttachment[]
}
