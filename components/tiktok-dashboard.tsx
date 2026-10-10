"use client"

import * as React from "react"

import { TikTokChatMonitor } from "@/components/tiktok-chat-monitor"
import { TikTokReferenceFiles } from "@/components/tiktok-reference-files"

export function TikTokDashboard() {
  const [selectedFileIds, setSelectedFileIds] = React.useState<string[]>([])

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <TikTokReferenceFiles selectedFileIds={selectedFileIds} onSelectedFileIdsChange={setSelectedFileIds} />
      <TikTokChatMonitor selectedFileIds={selectedFileIds} />
    </div>
  )
}
