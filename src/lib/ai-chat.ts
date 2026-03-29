export type ChatMessage = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "wallet-ai-chat-v1";

export function loadStoredMessages(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is ChatMessage =>
          m &&
          typeof m === "object" &&
          (m as ChatMessage).role !== undefined &&
          typeof (m as ChatMessage).content === "string"
      )
      .slice(-40);
  } catch {
    return [];
  }
}

export function saveStoredMessages(messages: ChatMessage[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  } catch {
    /* ignore quota */
  }
}

export function clearStoredMessages() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
