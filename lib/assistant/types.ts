// Events streamed as newline-delimited JSON from POST /api/assistant
export type AssistantEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string }
