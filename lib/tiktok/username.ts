// TikTok usernames: letters, digits, underscores and periods, up to 24 chars.
export function normalizeUsername(raw: string | null | undefined): string | null {
  const name = (raw ?? "").trim().replace(/^@/, "").toLowerCase()
  return /^[a-z0-9._]{2,24}$/.test(name) ? name : null
}
