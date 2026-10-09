import { TikTokLiveConnection } from "tiktok-live-connector"
import { normalizeUsername } from "@/lib/tiktok/username"

export const dynamic = "force-dynamic"

// GET /api/tiktok/live?username=foo -> { username, isLive }
export async function GET(request: Request) {
  const username = normalizeUsername(new URL(request.url).searchParams.get("username"))
  if (!username) {
    return Response.json({ error: "Invalid TikTok username" }, { status: 400 })
  }

  try {
    const isLive = await new TikTokLiveConnection(username, {}).fetchIsLive()
    return Response.json({ username, isLive })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to check live status"
    return Response.json({ error: message }, { status: 502 })
  }
}
