import { HugeiconsIcon } from "@hugeicons/react"
import { LiveStreaming02Icon } from "@hugeicons/core-free-icons"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
        <a href="/dashboard" className="flex items-center gap-2">
          {/* Placeholder logo until the real brand mark is ready */}
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HugeiconsIcon icon={LiveStreaming02Icon} strokeWidth={2} className="size-4" />
          </div>
          <span className="text-base font-semibold tracking-tight">LiveBuddy</span>
        </a>
      </header>
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col">{children}</main>
    </div>
  )
}
