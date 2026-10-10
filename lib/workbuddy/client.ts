import { randomUUID } from "node:crypto"
import { getWorkBuddyConfig } from "./config"
import type { AskWorkBuddyParams, AskWorkBuddyResult, WorkBuddyRunMessageEvent } from "./types"

export class WorkBuddyNotConfiguredError extends Error {
  constructor() {
    super("WORKBUDDY_API_URL / WORKBUDDY_API_TOKEN are not set.")
    this.name = "WorkBuddyNotConfiguredError"
  }
}

// Submits a question to the local WorkBuddy AI (CodeBuddy) gateway and waits
// for its reply over the run's SSE stream.
//
// Must open the stream immediately after the POST — the gateway drops a
// run's transcript (GET .../stream then 404s with RUN_NOT_FOUND) once the
// run finishes, so there's no reliable polling fallback.
export async function askWorkBuddy(
  { text, attachments }: AskWorkBuddyParams,
  { timeoutMs = 90_000 }: { timeoutMs?: number } = {}
): Promise<AskWorkBuddyResult> {
  const config = getWorkBuddyConfig()
  if (!config) throw new WorkBuddyNotConfiguredError()
  const { baseUrl, token } = config

  const headers = {
    Authorization: `Bearer ${token}`,
    "X-CodeBuddy-Request": "1",
  }

  const messageId = randomUUID()
  const postRes = await fetch(`${baseUrl}/api/v1/runs`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      id: messageId,
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

    let answer: string | null = null
    for await (const { event, data } of readSSE(streamRes.body)) {
      if (event === "message") {
        const parsed = JSON.parse(data) as WorkBuddyRunMessageEvent
        if (parsed.content?.markdown) answer = parsed.content.markdown
      } else if (event === "error") {
        throw new Error(`WorkBuddy run errored: ${data}`)
      } else if (event === "done") {
        break
      }
    }

    if (answer === null) throw new Error("WorkBuddy's stream ended without a reply.")
    return { answer }
  } finally {
    clearTimeout(timeout)
  }
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
