import { TikTokChatMonitor } from "@/components/tiktok-chat-monitor"

export default function Page() {
  return (
    <>
      <div className="flex flex-col gap-1 px-4 pt-6 pb-4">
        <h1 className="text-xl font-semibold tracking-tight">TikTok Live</h1>
        <p className="text-sm text-muted-foreground">
          Connect to a live stream, pick viewer comments, and let LiveBuddy draft the answers.
        </p>
      </div>
      <TikTokChatMonitor />
    </>
  )
}
