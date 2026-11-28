/**
 * src/lib/whatsapp/closing-replies.ts
 *
 * Courteous, warm closing and gratitude acknowledgment handlers for Best Auto Parts CRM.
 * Detects satisfied customer closing remarks ("ok", "okay", "thanks", "thank you", "thx",
 * "shukriya", "dhanyawad", "ji", "theek hai", "achha", "nice", "👍") and replies warmly
 * in English or Hinglish without triggering AI fallback or repeating interactive store menus.
 */

export const CLOSING_REPLY_ENGLISH =
  "You're most welcome! 😊 Please feel free to message anytime if you need help with Spare Parts, ITR, Insurance, or RTO Tax/Challan. — *Best Auto Parts* (+91 96347 22174)"

export const CLOSING_REPLY_HINGLISH =
  "Aapka bahut-bahut shukriya! 😊 Spare Parts, ITR, Insurance ya RTO Tax/Challan me koi bhi madad chahiye ho toh aap jab chahein message kar sakte hain. — *Best Auto Parts* (+91 96347 22174)"

/**
 * Checks whether an inbound customer message is a closing / gratitude remark
 * rather than a fresh product, vehicle, or order inquiry.
 */
export function isClosingOrGratitudeMessage(text: string): boolean {
  if (!text) return false
  const trimmed = text.trim()
  if (!trimmed) return false

  // 1. Direct emoji-only checks: 👍 (all skin tones), 🙏, 😊, ❤️, ✨
  const cleanEmojis = trimmed.replace(/[\s.,!?-]+/g, '')
  if (
    /^([\u{1F44D}\u{1F3FB}-\u{1F3FF}\u{1F64F}\u{1F60A}\u{2764}\u{FE0F}\u{2728}]+)$/u.test(
      cleanEmojis,
    )
  ) {
    return true
  }

  const lower = trimmed.toLowerCase()

  // 2. Guard against affirmative Yes ("ji haan", "haan ji", "ji ha", "ha ji")
  if (/^(ji\s*haan|haan\s*ji|ji\s*ha|ha\s*ji)\b/i.test(lower)) {
    return false
  }

  // 3. Guard against spare part inquiries containing "ok" or "thanks"
  // (e.g. "ok pulsar brake shoe price", "thanks activa battery available?")
  if (
    /(pulsar|platina|discover|splendor|deluxe|passion|glamour|activa|shine|unicorn|dio|brake|clutch|battery|chain|sprocket|filter|spark|plug|price|rate|delivery|pickup|address|location|pin\s*code)/i.test(
      lower,
    )
  ) {
    return false
  }

  // 4. Regex matching single or multi-word closing / gratitude phrases
  // e.g. "ok", "okay", "thanks", "thank you", "thx", "shukriya", "dhanyawad",
  // "ji", "theek hai", "achha", "nice", "done", "all done", "ok thanks", "theek hai ji", "shukriya bhai", "nice 👍"
  const CLOSING_REGEX =
    /^(ok|okay|okk+|okey|k|thanks|thank\s*you|thank\s*u|thx|thnx|ty|shukriya|shukriyaa|dhanyawad|dhanyavaad|theek\s*hai|thik\s*hai|teek\s*hai|tik\s*hai|theek\s*h|thik\s*h|achha|accha|acha|nice|very\s*nice|good|great|ji|done|all\s*done|ok\s*done|sahi\s*hai|bahut\s*shukriya)(\s+(ok|okay|thanks|thank\s*you|thank\s*u|thx|shukriya|dhanyawad|theek\s*hai|thik\s*hai|achha|accha|acha|ji|done|bhai|sir|saud\s*bhai|saud\s*ji|yaar|dost|bahut|so\s*much|a\s*lot))*[\s.,!?\u{1F44D}\u{1F3FB}-\u{1F3FF}\u{1F64F}\u{1F60A}\u{2764}\u{FE0F}\u{2728}]*$/iu

  return CLOSING_REGEX.test(lower)
}

/**
 * Determines whether the response should be in Hinglish or English based on
 * customer preference or natural message phrasing.
 */
export function isHinglishClosing(
  text: string,
  preferredLanguage?: string | null,
): boolean {
  if (preferredLanguage === 'hinglish') return true
  if (preferredLanguage === 'en') return false

  const lower = text.trim().toLowerCase()
  return (
    /^(shukriya|dhanyawad|dhanyavaad|theek|thik|teek|tik|achha|accha|acha|ji|sahi|bahut|aapka)/i.test(
      lower,
    ) ||
    /\b(shukriya|dhanyawad|theek|thik|achha|accha|ji|bhai|yaar)\b/i.test(
      lower,
    )
  )
}

/**
 * Returns the exact closing thank-you message for the customer.
 */
export function getClosingReply(
  text: string,
  preferredLanguage?: string | null,
): string {
  return isHinglishClosing(text, preferredLanguage)
    ? CLOSING_REPLY_HINGLISH
    : CLOSING_REPLY_ENGLISH
}
