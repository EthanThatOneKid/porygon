import Letta from "@letta-ai/letta-client";
import {
  Message,
  OmitPartialGroupDMChannel,
} from "discord.js";
import {
  AttachmentBuilder,
} from "discord.js";

// ── Letta client ───────────────────────────────────────────────────────────────
const LETTA_TIMEOUT_MS = parseInt(
  process.env.LETTA_TIMEOUT_MS || "60000",
  10,
);

const letta = new Letta({
  apiKey: process.env.LETTA_API_KEY || "",
  baseURL: process.env.LETTA_BASE_URL || "https://api.letta.com",
  timeout: LETTA_TIMEOUT_MS,
  maxRetries: 1,
});

const AGENT_ID = process.env.LETTA_AGENT_ID || "";
const USE_SENDER_PREFIX = process.env.LETTA_USE_SENDER_PREFIX !== "false"; // default true
const CONTEXT_MESSAGE_COUNT = parseInt(
  process.env.LETTA_CONTEXT_MESSAGE_COUNT || "5",
  10,
);
const THREAD_CONTEXT_ENABLED =
  process.env.LETTA_THREAD_CONTEXT_ENABLED !== "false"; // default true
const THREAD_MESSAGE_LIMIT = parseInt(
  process.env.LETTA_THREAD_MESSAGE_LIMIT || "50",
  10,
);
const ENABLE_IMAGE_HANDLING = process.env.ENABLE_IMAGE_HANDLING === "true";
const IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit

// ── Message types ──────────────────────────────────────────────────────────────
export enum MessageType {
  DM = "DM",
  MENTION = "MENTION",
  REPLY = "REPLY",
  GENERIC = "GENERIC",
}

// ── Format prefix for a message type ─────────────────────────────────────────
export function formatPrefix(
  username: string,
  userId: string,
  messageType: MessageType,
  channelName: string,
): string {
  if (!USE_SENDER_PREFIX) return "";
  switch (messageType) {
    case MessageType.DM:
      return `[${username} (id=${userId}) sent you a direct message]`;
    case MessageType.MENTION:
      return `[${username} (id=${userId}) mentioned you in ${channelName}]`;
    case MessageType.REPLY:
      return `[${username} (id=${userId}) replied to you in ${channelName}]`;
    case MessageType.GENERIC:
      return `[${username} (id=${userId}) in ${channelName}]`;
  }
}

// ── Image handling ───────────────────────────────────────────────────────────
interface ImageContentBlock {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

async function extractImageAttachments(
  message: OmitPartialGroupDMChannel<Message<boolean>>,
): Promise<ImageContentBlock[]> {
  if (!ENABLE_IMAGE_HANDLING) return [];
  const images: ImageContentBlock[] = [];
  const supportedTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];

  for (const [, attachment] of message.attachments) {
    if (attachment.size && attachment.size > IMAGE_MAX_SIZE_BYTES) {
      console.log(
        `🖼️ Skipping large image: ${attachment.name || "unnamed"} (${(attachment.size / 1024 / 1024).toFixed(1)}MB > 5MB limit)`,
      );
      continue;
    }

    let mediaType = attachment.contentType;
    if (!mediaType || !supportedTypes.includes(mediaType)) {
      const ext = attachment.url.split(".").pop()?.toLowerCase().split("?")[0];
      if (ext === "png") mediaType = "image/png";
      else if (ext === "jpg" || ext === "jpeg") mediaType = "image/jpeg";
      else if (ext === "gif") mediaType = "image/gif";
      else if (ext === "webp") mediaType = "image/webp";
      else continue;
    }

    try {
      const response = await fetch(attachment.url);
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > IMAGE_MAX_SIZE_BYTES) {
        console.log(
          `🖼️ Skipping large image after fetch: ${attachment.name || "unnamed"}`,
        );
        continue;
      }
      const base64Data = Buffer.from(buffer).toString("base64");
      images.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64Data },
      });
      console.log(
        `🖼️ Encoded image: ${attachment.name || "unnamed"} (${mediaType}, ${(buffer.byteLength / 1024).toFixed(0)}KB)`,
      );
    } catch (error) {
      console.error(`❌ Failed to fetch image ${attachment.url}:`, error);
    }
  }

  if (images.length > 0) {
    console.log(`🖼️ Total images encoded: ${images.length}`);
  }
  return images;
}

// ── Send raw message string to Letta ──────────────────────────────────────────
export async function sendMessageRaw(
  fullMessage: string,
  images: ImageContentBlock[] = [],
): Promise<string> {
  if (!AGENT_ID) {
    throw new Error("LETTA_AGENT_ID not set");
  }

  // Build multi-modal content if images are present
  let content: string | any[];
  if (images.length > 0) {
    content = [{ type: "text", text: fullMessage }, ...images];
  } else {
    content = fullMessage;
  }

  console.log(
    `📤 Sending to Letta (agent=${AGENT_ID}): ${fullMessage.substring(0, 100)}...` +
    (images.length > 0 ? ` (+${images.length} images)` : ""),
  );
  const response = await letta.agents.messages.create(AGENT_ID, {
    messages: [{ role: "user", content }],
  });
  console.log(`📥 Letta responded (${response.messages?.length || 0} messages)`);
  console.log(`📥 Messages:`, JSON.stringify(response.messages?.map((m: any) => ({ role: m.role, content: m.content }))));

  // Handle both formats: messages with role field, or messages with just content
  const assistantMessages = response.messages?.filter(
    (m: any) => m.role === "assistant" || (!m.role && m.content),
  );

  console.log(`📥 Assistant messages found: ${assistantMessages?.length || 0}`);

  if (!assistantMessages || assistantMessages.length === 0) {
    console.log(`📥 No assistant messages - returning empty`);
    return "";
  }

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

// ── Send message to Letta and get response ─────────────────────────────────────
export async function sendMessage(
  message: OmitPartialGroupDMChannel<Message<boolean>>,
  messageType: MessageType,
): Promise<string> {
  if (!AGENT_ID) {
    throw new Error("LETTA_AGENT_ID not set");
  }

  const username = message.author.username;
  const userId = message.author.id;
  const channelName =
    "name" in message.channel && message.channel.name
      ? `#${message.channel.name}`
      : "DM";

  const prefix = formatPrefix(username, userId, messageType, channelName);

  // Fetch conversation context
  let contextBlock = "";
  if (message.guild) {
    if (THREAD_CONTEXT_ENABLED && message.channel.isThread()) {
      // Thread context: fetch thread starter + replies
      try {
        const thread = message.channel;
        const threadName = thread.name || "Thread";
        const messages = await thread.messages.fetch({
          limit: THREAD_MESSAGE_LIMIT,
        });
        const sorted = Array.from(messages.values()).reverse();
        const starter = sorted[0];
        const replies = sorted.slice(1).filter((m) => m.id !== message.id);

        let threadBlock = `[Thread: "${threadName}"]\n`;
        if (starter) {
          threadBlock += `[Thread started by ${starter.author.username}: "${starter.content}"]\n`;
        }
        if (replies.length > 0) {
          threadBlock += `[Thread conversation history:]\n`;
          for (const m of replies) {
            threadBlock += `- ${m.author.username}: ${m.content}\n`;
          }
          threadBlock += `[End thread context]\n`;
        }
        contextBlock = threadBlock;
      } catch {
        // ignore fetch errors
      }
    } else if (CONTEXT_MESSAGE_COUNT > 0) {
      // Regular channel context
      try {
        const messages = await message.channel.messages.fetch({
          limit: CONTEXT_MESSAGE_COUNT + 1,
        });
        const recent = Array.from(messages.values())
          .filter((m) => m.id !== message.id)
          .slice(-CONTEXT_MESSAGE_COUNT);

        if (recent.length > 0) {
          const lines = recent.map(
            (m) => `- ${m.author.username}: ${m.content}`,
          );
          contextBlock = `[Recent conversation context:]\n${lines.join("\n")}\n[End context]\n`;
        }
      } catch {
        // ignore fetch errors
      }
    }
  }

  const fullMessage = `${contextBlock}${prefix} ${message.content}`.trim();
  const images = await extractImageAttachments(message);
  return sendMessageRaw(fullMessage, images);
}

// ── Send timer/heartbeat message to Letta ────────────────────────────────────
export async function sendTimerMessage(): Promise<string> {
  if (!AGENT_ID) {
    throw new Error("LETTA_AGENT_ID not set");
  }

  const fullMessage =
    "[Timer event] This is a periodic heartbeat. Check if there is anything you should proactively do, such as updating your memory, following up on tasks, or initiating a conversation. If there is nothing to do, respond with an empty string.";

  console.log(`📤 Sending timer heartbeat to Letta (agent=${AGENT_ID})`);
  const response = await letta.agents.messages.create(AGENT_ID, {
    messages: [{ role: "user", content: fullMessage }],
  });
  console.log(`📥 Letta responded (${response.messages?.length || 0} messages)`);

  const assistantMessages = response.messages?.filter(
    (m: any) => m.role === "assistant",
  );

  if (!assistantMessages || assistantMessages.length === 0) {
    return "";
  }

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

    // Check if we're inside a code block
    const codeBlockCount = (remaining.match(/```/g) || []).length;
    const inCodeBlock = codeBlockCount % 2 !== 0;

    if (inCodeBlock) {
      // Find the closing ``` within the limit
      const closeIndex = remaining.indexOf("```", 3);
      if (closeIndex > 0 && closeIndex <= DISCORD_LIMIT) {
        // Include the closing fence in this chunk
        const endOfFence = closeIndex + 3;
        // Find a good split point after the code block
        const afterCode = remaining.substring(endOfFence);
        const nextNewline = afterCode.indexOf("\n");
        const splitPoint =
          nextNewline > 0 ? endOfFence + nextNewline + 1 : endOfFence;
        chunks.push(remaining.substring(0, Math.min(splitPoint, DISCORD_LIMIT)));
        remaining = remaining
          .substring(Math.min(splitPoint, DISCORD_LIMIT))
          .trimStart();
      } else {
        // Code block doesn't close within limit, try to split before it
        const lastFence = remaining.lastIndexOf("```", DISCORD_LIMIT);
        if (lastFence > 0) {
          chunks.push(remaining.substring(0, lastFence));
          remaining = remaining.substring(lastFence).trimStart();
        } else {
          // Hard cut as last resort
          chunks.push(remaining.substring(0, DISCORD_LIMIT));
          remaining = remaining.substring(DISCORD_LIMIT).trimStart();
        }
      }
    } else {
      // Not in a code block, split at newline
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
  }

  return chunks;
}
