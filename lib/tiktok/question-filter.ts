export type QuestionFilterResult = {
  isQuestion: boolean
  confidence: "high" | "medium" | "low"
  reason: string
}

const QUESTION_WORDS = [
  "what",
  "which",
  "when",
  "where",
  "why",
  "how",
  "can",
  "do",
  "does",
  "is",
  "are",
  "will",
  "would",
  "size",
  "price",
  "cost",
  "stock",
  "available",
  "ship",
  "shipping",
  "delivery",
  "cod",
  "return",
  "refund",
  "material",
  "color",
  "colour",
  "promo",
  "discount",
  "fit",
  "warranty",
]

const PRODUCT_INTENT_PATTERNS = [
  /\b(how much|price|cost|rm|stock|available|sold out|size|sizes|fit|measurements?)\b/i,
  /\b(ship|shipping|delivery|postage|cod|return|refund|exchange|warranty)\b/i,
  /\b(material|fabric|color|colour|variant|bundle|promo|discount|voucher)\b/i,
  /\b(can i|can you|do you|does it|is it|are there|will it|would it)\b/i,
]

const CHATTER_PATTERNS = [
  /\b(hi|hello|hey|lol|haha|nice|wow|omg|first|follow back|fyp|share|liked?)\b/i,
  /\b(jom|cantik|murah gila|hadir|support|done)\b/i,
]

export function classifyTikTokComment(text: string): QuestionFilterResult {
  const normalized = text.trim().replace(/\s+/g, " ")
  const lower = normalized.toLowerCase()

  if (!normalized) {
    return { isQuestion: false, confidence: "high", reason: "Empty comment" }
  }

  if (normalized.length > 240) {
    return { isQuestion: false, confidence: "medium", reason: "Too long for a product question" }
  }

  if (isMostlySymbols(normalized)) {
    return { isQuestion: false, confidence: "high", reason: "Mostly emoji or symbols" }
  }

  if (/(.)\1{7,}/.test(lower)) {
    return { isQuestion: false, confidence: "medium", reason: "Repeated characters" }
  }

  if (/(https?:\/\/|www\.|t\.me\/|wa\.me\/)/i.test(lower)) {
    return { isQuestion: false, confidence: "high", reason: "External link spam" }
  }

  const hasQuestionMark = normalized.includes("?")
  const hasQuestionWord = QUESTION_WORDS.some((word) => new RegExp(`\\b${word}\\b`, "i").test(lower))
  const hasProductIntent = PRODUCT_INTENT_PATTERNS.some((pattern) => pattern.test(lower))
  const isShortChatter = normalized.length <= 28 && CHATTER_PATTERNS.some((pattern) => pattern.test(lower))

  if (hasProductIntent && (hasQuestionMark || hasQuestionWord)) {
    return { isQuestion: true, confidence: "high", reason: "Product question" }
  }

  if (hasProductIntent) {
    return { isQuestion: true, confidence: "medium", reason: "Likely product intent" }
  }

  if (hasQuestionMark && hasQuestionWord && !isShortChatter) {
    return { isQuestion: true, confidence: "medium", reason: "General question" }
  }

  if (hasQuestionMark && normalized.length > 8 && !isShortChatter) {
    return { isQuestion: true, confidence: "low", reason: "Possible question" }
  }

  return { isQuestion: false, confidence: isShortChatter ? "high" : "medium", reason: "Not a product question" }
}

function isMostlySymbols(value: string) {
  const lettersOrNumbers = value.match(/[\p{L}\p{N}]/gu)?.length ?? 0
  return value.length >= 2 && lettersOrNumbers / Array.from(value).length < 0.25
}
