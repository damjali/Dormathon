export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-theme flex min-h-svh flex-col bg-background">
      <main className="flex w-full flex-1 flex-col">{children}</main>
    </div>
  )
}
