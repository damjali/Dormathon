import { HugeiconsIcon } from "@hugeicons/react"
import { LiveStreaming02Icon } from "@hugeicons/core-free-icons"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-theme flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b bg-background/85 px-4 backdrop-blur-xl sm:px-6">
        <a href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-xl bg-[#161823] text-white shadow-[2px_2px_0_#25f4ee,-2px_-2px_0_#fe2c55]">
            <HugeiconsIcon icon={LiveStreaming02Icon} strokeWidth={2} className="size-4" />
          </div>
          <span className="text-base font-semibold tracking-tight">LiveBuddy</span>
        </a>
        <span className="hidden items-center gap-2 rounded-full border border-[#2b2c33] bg-[#121318] px-3 py-1 text-xs text-muted-foreground sm:inline-flex">
          <span className="size-1.5 rounded-full bg-[#25c9c4]" />
          Creator workspace
        </span>
      </header>
      <main className="flex w-full flex-1 flex-col">{children}</main>
    </div>
  )
}
