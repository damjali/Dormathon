import { randomUUID } from "node:crypto"
import { getWorkBuddyConfig } from "./config"
import type { AskWorkBuddyParams, AskWorkBuddyResult, WorkBuddyRunMessageEvent } from "./types"

export class WorkBuddyNotConfiguredError extends Error {
  constructor() {
    super("WORKBUDDY_API_URL / WORKBUDDY_API_TOKEN are not set.")
    this.name = "WorkBuddyNotConfiguredError"
  }
}

// Submits a question to the local WorkBuddy AI (CodeBuddy) gateway and
// yields the reply's markdown *as it stands so far* each time the run's SSE
// stream reports an update (at minimum once, with the final answer).
//
// Must open the stream immediately after the POST — the gateway drops a
// run's transcript (GET .../stream then 404s with RUN_NOT_FOUND) once the
// run finishes, so there's no reliable polling fallback.
export async function* streamWorkBuddy(
  { text, attachments, workspaceDirs }: AskWorkBuddyParams,
  { timeoutMs = 90_000 }: { timeoutMs?: number } = {}
): AsyncGenerator<string> {
  const config = getWorkBuddyConfig()
  if (!config) throw new WorkBuddyNotConfiguredError()
  const { baseUrl, token } = config

  const headers = {
    Authorization: `Bearer ${token}`,
    "X-CodeBuddy-Request": "1",
  }

  for (const dir of workspaceDirs ?? []) {
    await addWorkspaceDir(baseUrl, headers, dir)
  }

  const postRes = await fetch(`${baseUrl}/api/v1/runs`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: randomUUID(),
      type: "message",
      payload: { text, attachments },
    }),
  })

  if (!postRes.ok) {
    throw new Error(`WorkBuddy rejected the request (${postRes.status}): ${await postRes.text()}`)
  }

  const postBody = (await postRes.json()) as { data?: { runId?: string }; error?: { message?: string } }
  const runId = postBody.data?.runId
  if (!runId) {
    throw new Error(postBody.error?.message ?? "WorkBuddy did not return a runId.")
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const streamRes = await fetch(`${baseUrl}/api/v1/runs/${runId}/stream`, {
      headers,
      signal: controller.signal,
    })
    if (!streamRes.ok || !streamRes.body) {
      throw new Error(`WorkBuddy stream failed (${streamRes.status}): ${await streamRes.text()}`)
    }

    let sawAnswer = false
    for await (const { event, data } of readSSE(streamRes.body)) {
      if (event === "message") {
        const parsed = JSON.parse(data) as WorkBuddyRunMessageEvent
        if (parsed.content?.markdown) {
          sawAnswer = true
          yield parsed.content.markdown
        }
      } else if (event === "error") {
        throw new Error(`WorkBuddy run errored: ${data}`)
      } else if (event === "done") {
        break
      }
    }

    if (!sawAnswer) throw new Error("WorkBuddy's stream ended without a reply.")
  } finally {
    clearTimeout(timeout)
  }
}

async function addWorkspaceDir(baseUrl: string, headers: Record<string, string>, dir: string) {
  if (await hasWorkspaceDir(baseUrl, headers, dir)) return

  const res = await fetch(`${baseUrl}/api/v1/workspace-dirs`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ path: dir }),
  })

  if (!res.ok) {
    throw new Error(`WorkBuddy could not attach product docs directory (${res.status}): ${await res.text()}`)
  }
}

async function hasWorkspaceDir(baseUrl: string, headers: Record<string, string>, dir: string) {
  const res = await fetch(`${baseUrl}/api/v1/workspace-dirs`, { headers })
  if (!res.ok) return false

  const body = await res.json().catch(() => null)
  return containsDir(body, dir)
}

function containsDir(value: unknown, dir: string): boolean {
  if (typeof value === "string") return value === dir
  if (Array.isArray(value)) return value.some((item) => containsDir(item, dir))
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => containsDir(item, dir))
  }
  return false
}

// Convenience wrapper over streamWorkBuddy() for callers that just want the
// final answer, not incremental updates.
export async function askWorkBuddy(
  params: AskWorkBuddyParams,
  opts?: { timeoutMs?: number }
): Promise<AskWorkBuddyResult> {
  let answer = ""
  for await (const snapshot of streamWorkBuddy(params, opts)) answer = snapshot
  return { answer }
}

// Minimal SSE frame reader: splits "event: x\ndata: y\n\n" blocks off a
// fetch() response body. Good enough for this gateway's output — doesn't
// handle multi-line `data:` fields or `id:`/`retry:`, which it doesn't send.
async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })

      let sep: number
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)

        let event = "message"
        const dataLines: string[] = []
        for (const line of block.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim()
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim())
        }
        if (dataLines.length) yield { event, data: dataLines.join("\n") }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
