import Letta from "@letta-ai/letta-client";
import {
  Message,
  OmitPartialGroupDMChannel,
} from "discord.js";

// ── Letta client ───────────────────────────────────────────────────────────────
const letta = new Letta({
  apiKey: process.env.LETTA_API_KEY || "",
  baseURL: process.env.LETTA_BASE_URL || "https://api.letta.com",
});

const AGENT_ID = process.env.LETTA_AGENT_ID || "";
const USE_SENDER_PREFIX = process.env.LETTA_USE_SENDER_PREFIX !== "false"; // default true
const CONTEXT_MESSAGE_COUNT = parseInt(
  process.env.LETTA_CONTEXT_MESSAGE_COUNT || "5",
  10,
);

// ── Message types ──────────────────────────────────────────────────────────────
export enum MessageType {
  DM = "DM",
  MENTION = "MENTION",
  REPLY = "REPLY",
  GENERIC = "GENERIC",
}

// ── Send message to Letta and get response ─────────────────────────────────────
export async function sendMessage(
  message: OmitPartialGroupDMChannel<Message<boolean>>,
  messageType: MessageType,
): Promise<string> {
  if (!AGENT_ID) {
    throw new Error("LETTA_AGENT_ID not set");
  }

  // Build the message content with sender context
  const username = message.author.username;
  const userId = message.author.id;
  const channelName =
    "name" in message.channel && message.channel.name
      ? `#${message.channel.name}`
      : "DM";

  let prefix = "";
  if (USE_SENDER_PREFIX) {
    switch (messageType) {
      case MessageType.DM:
        prefix = `[${username} (id=${userId}) sent you a direct message]`;
        break;
      case MessageType.MENTION:
        prefix = `[${username} (id=${userId}) mentioned you in ${channelName}]`;
        break;
      case MessageType.REPLY:
        prefix = `[${username} (id=${userId}) replied to you in ${channelName}]`;
        break;
      case MessageType.GENERIC:
        prefix = `[${username} (id=${userId}) in ${channelName}]`;
        break;
    }
  }

  // Fetch recent conversation context
  let contextBlock = "";
  if (CONTEXT_MESSAGE_COUNT > 0 && message.guild) {
    try {
      const messages = await message.channel.messages.fetch({
        limit: CONTEXT_MESSAGE_COUNT + 1, // +1 to exclude current
      });
      const recent = Array.from(messages.values())
        .filter((m) => m.id !== message.id)
        .slice(-CONTEXT_MESSAGE_COUNT);

      if (recent.length > 0) {
        const lines = recent.map((m) => `- ${m.author.username}: ${m.content}`);
        contextBlock = `[Recent conversation context:]\n${lines.join("\n")}\n[End context]\n`;
      }
    } catch {
      // ignore fetch errors
    }
  }

  const fullMessage = `${contextBlock}${prefix} ${message.content}`.trim();

  // Send to Letta and get response
  const response = await letta.agents.messages.create(AGENT_ID, {
    messages: [{ role: "user", content: fullMessage }],
  });

  // Extract assistant messages from response
  const assistantMessages = response.messages?.filter(
    (m: any) => m.role === "assistant",
  );

  if (!assistantMessages || assistantMessages.length === 0) {
    return "";
  }

  // Concatenate all assistant message content
  return assistantMessages
    .map((m: any) => {
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.content)) {
        return m.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

// ── Message splitting (Discord 2000 char limit) ────────────────────────────────
const DISCORD_LIMIT = 2000;

export function splitMessage(content: string): string[] {
  if (content.length <= DISCORD_LIMIT) return [content];

  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= DISCORD_LIMIT) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline
    let splitIndex = remaining.lastIndexOf("\n", DISCORD_LIMIT);
    if (splitIndex <= 0) {
      // Try to split at a space
      splitIndex = remaining.lastIndexOf(" ", DISCORD_LIMIT);
    }
    if (splitIndex <= 0) {
      // Hard cut
      splitIndex = DISCORD_LIMIT;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return chunks;
}
