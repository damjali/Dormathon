"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { HugeiconsIcon } from "@hugeicons/react"
import { Attachment01Icon, RefreshIcon } from "@hugeicons/core-free-icons"
import type { EmailDetail, EmailSummary } from "@/lib/gmail/types"

function formatDate(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

export function EmailsTable({ initialEmails }: { initialEmails: EmailSummary[] }) {
  const [emails, setEmails] = React.useState(initialEmails)
  const [refreshing, setRefreshing] = React.useState(false)
  const [refreshError, setRefreshError] = React.useState<string | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<EmailDetail | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)

  async function refresh() {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const res = await fetch("/api/emails", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "failed to refresh")
      setEmails(json.emails)
    } catch (err) {
      setRefreshError((err as Error).message)
    } finally {
      setRefreshing(false)
    }
  }

  async function openEmail(id: string) {
    setSelectedId(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/emails/${id}`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "failed to load email")
      setDetail(json.email)
    } catch (err) {
      setDetail(null)
      setRefreshError((err as Error).message)
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {emails.length} email{emails.length === 1 ? "" : "s"}
        </p>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className={refreshing ? "animate-spin" : ""} />
          <span>Refresh</span>
        </Button>
      </div>
      {refreshError && <p className="text-sm text-destructive">{refreshError}</p>}

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>From</TableHead>
              <TableHead>Cc</TableHead>
              <TableHead>Date</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {emails.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No emails yet.
                </TableCell>
              </TableRow>
            )}
            {emails.map((email) => (
              <TableRow
                key={email.id}
                className="cursor-pointer"
                onClick={() => openEmail(email.id)}
              >
                <TableCell className="max-w-72 truncate font-medium">{email.subject}</TableCell>
                <TableCell className="max-w-56 truncate">{email.from}</TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">
                  {email.cc.length ? email.cc.join(", ") : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{formatDate(email.date)}</TableCell>
                <TableCell>
                  {email.hasAttachments && (
                    <Badge variant="secondary">
                      <HugeiconsIcon icon={Attachment01Icon} strokeWidth={2} data-icon="inline-start" />
                      Attachment
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={selectedId !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="sm:max-w-lg" side="right">
          <SheetHeader>
            <SheetTitle>{detail?.subject ?? (detailLoading ? "Loading…" : "Email")}</SheetTitle>
            {detail && (
              <SheetDescription className="flex flex-col gap-1 text-left">
                <span>
                  <span className="text-foreground">From:</span> {detail.from}
                </span>
                <span>
                  <span className="text-foreground">To:</span> {detail.to.join(", ") || "—"}
                </span>
                <span>
                  <span className="text-foreground">Cc:</span> {detail.cc.join(", ") || "—"}
                </span>
                <span>
                  <span className="text-foreground">Date:</span> {formatDate(detail.date)}
                </span>
              </SheetDescription>
            )}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {detailLoading && <p className="text-sm text-muted-foreground">Loading email…</p>}
            {detail && (
              <div className="flex flex-col gap-4">
                {detail.attachments.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium">Attachments</p>
                    <ul className="flex flex-col gap-1">
                      {detail.attachments.map((a, i) => (
                        <li key={`${a.filename}-${i}`} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <HugeiconsIcon icon={Attachment01Icon} strokeWidth={2} className="size-4" />
                          {a.filename}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <pre className="whitespace-pre-wrap font-sans text-sm">{detail.bodyText || detail.snippet}</pre>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
