import { ImapFlow } from "imapflow"
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser"
import { getImapCredentials, GMAIL_BOT_EMAIL, GMAIL_IMAP_HOST, GMAIL_IMAP_PORT } from "./config"
import type { EmailDetail, EmailSummary } from "./types"

// Every message in averisbot@gmail.com's own inbox already arrived because it
// was sent or cc'd to that address, but the explicit Gmail search query also
// reaches archived (non-inbox) mail and keeps the intent obvious.
const INBOX_QUERY = `to:${GMAIL_BOT_EMAIL} OR cc:${GMAIL_BOT_EMAIL}`

async function withInbox<T>(fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const { user, pass } = getImapCredentials()
  const client = new ImapFlow({
    host: GMAIL_IMAP_HOST,
    port: GMAIL_IMAP_PORT,
    secure: true,
    auth: { user, pass },
    logger: false,
  })

  await client.connect()
  try {
    const lock = await client.getMailboxLock("INBOX")
    try {
      return await fn(client)
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }
}

function addressListToStrings(field: AddressObject | AddressObject[] | undefined): string[] {
  if (!field) return []
  const objects = Array.isArray(field) ? field : [field]
  return objects.flatMap((o) => o.value.map((v) => v.address ?? v.name).filter(Boolean)) as string[]
}

function toEmailDetail(uid: number, mail: ParsedMail): EmailDetail {
  const attachments = mail.attachments.map((a) => ({
    filename: a.filename ?? "attachment",
    mimeType: a.contentType,
    size: a.size,
  }))

  return {
    id: String(uid),
    subject: mail.subject || "(no subject)",
    from: mail.from?.text ?? "",
    to: addressListToStrings(mail.to),
    cc: addressListToStrings(mail.cc),
    date: mail.date ? mail.date.toISOString() : "",
    snippet: (mail.text ?? "").replace(/\s+/g, " ").trim().slice(0, 180),
    hasAttachments: attachments.length > 0,
    bodyText: mail.text ?? "",
    bodyHtml: mail.html || null,
    attachments,
  }
}

function toEmailSummary(detail: EmailDetail): EmailSummary {
  const { bodyText: _bodyText, bodyHtml: _bodyHtml, attachments: _attachments, ...summary } = detail
  return summary
}

export async function listInboxEmails(maxResults = 50): Promise<EmailSummary[]> {
  return withInbox(async (client) => {
    const uids = await client.search({ gmraw: INBOX_QUERY }, { uid: true })
    if (!uids || uids.length === 0) return []

    // UIDs increase over time within a mailbox — take the highest (newest) ones.
    const targetUids = uids.slice(-maxResults).reverse()

    const summaries: EmailSummary[] = []
    for await (const message of client.fetch(targetUids, { source: true }, { uid: true })) {
      if (!message.source) continue
      const mail = await simpleParser(message.source)
      summaries.push(toEmailSummary(toEmailDetail(message.uid, mail)))
    }

    // fetch() doesn't guarantee ordering, so sort explicitly, newest first.
    return summaries.sort((a, b) => (a.date < b.date ? 1 : -1))
  })
}

export async function getEmailById(id: string): Promise<EmailDetail> {
  const uid = Number(id)
  if (!Number.isInteger(uid)) throw new Error(`invalid email id: ${id}`)

  return withInbox(async (client) => {
    for await (const message of client.fetch(uid, { source: true }, { uid: true })) {
      if (!message.source) break
      const mail = await simpleParser(message.source)
      return toEmailDetail(message.uid, mail)
    }
    throw new Error(`no such email: ${id}`)
  })
}
