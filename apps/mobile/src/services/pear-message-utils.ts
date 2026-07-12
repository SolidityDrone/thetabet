export const PEAR_KEY_SHARE_PREFIX = '__KEY_SHARE__:'
export const PEAR_PRESENCE_PREFIX = '__PRESENCE__:'

export function isPearSystemMessage(text?: string | null): boolean {
  if (!text) return false
  return text.startsWith(PEAR_KEY_SHARE_PREFIX) || text.startsWith(PEAR_PRESENCE_PREFIX)
}

export function filterChatMessages<T extends { text?: string }>(messages: T[]): T[] {
  return messages.filter((message) => !isPearSystemMessage(message.text))
}

export function mergeChatMessages<T extends { id?: string; timestamp?: number }>(
  current: T[],
  incoming: T[]
): T[] {
  const byId = new Map<string, T>()
  for (const message of current) {
    if (message.id) byId.set(message.id, message)
  }
  for (const message of incoming) {
    if (message.id) byId.set(message.id, message)
  }
  return Array.from(byId.values()).sort(
    (left, right) => (left.timestamp || 0) - (right.timestamp || 0)
  )
}
