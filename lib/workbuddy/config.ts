import path from "node:path"

// Local WorkBuddy AI / CodeBuddy HTTP gateway (`codebuddy --serve`).
// One-time setup: run `codebuddy /login` once, then start the server with
// `codebuddy --serve --port 8321` (or let it pick a port — check the printed
// endpoint/password). See context.md for details.
export function getWorkBuddyConfig() {
  const baseUrl = process.env.WORKBUDDY_API_URL
  const token = process.env.WORKBUDDY_API_TOKEN
  if (!baseUrl || !token) return null
  return { baseUrl: baseUrl.replace(/\/+$/, ""), token }
}

export function getWorkBuddyProductDocsDir() {
  return path.resolve(process.env.WORKBUDDY_PRODUCT_DOCS_DIR ?? path.join(process.cwd(), "workbuddy-product-docs"))
}
