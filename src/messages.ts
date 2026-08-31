import {
  LettaAgentClient,
  CloudManagedSandboxExpiredError,
} from "@letta-ai/letta-agent-sdk";
import type {
  LettaCodeSession,
  CanUseToolResponse,
} from "@letta-ai/letta-agent-sdk";
import {
  Message,
  OmitPartialGroupDMChannel,
} from "discord.js";

// ── Letta client (Agent SDK with cloud backend) ──────────────────────────────
const LETTA_TIMEOUT_MS = parseInt(
  process.env.LETTA_TIMEOUT_MS || "60000",
  10,
);

const letta = new LettaAgentClient({
  backend: "cloud",
  apiKey: process.env.LETTA_API_KEY || "",
  requestTimeoutMs: LETTA_TIMEOUT_MS,
  sandbox: {
    ttlMinutes: parseInt(process.env.SANDBOX_TTL_MINUTES || "5", 10),
    refreshIntervalMs: parseInt(
      process.env.SANDBOX_REFRESH_INTERVAL_MS || "240000",
      10,
    ),
  },
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

// ── Tool approval configuration (#32) ────────────────────────────────────────
const ENABLE_TOOL_APPROVAL = process.env.ENABLE_TOOL_APPROVAL === "true";
const TOOL_APPROVAL_TIMEOUT_MS = parseInt(
  process.env.TOOL_APPROVAL_TIMEOUT_MS || "60000",
  10,
);

// ── Session isolation configuration (#33) ─────────────────────────────────────
type SessionIsolation = "user" | "channel" | "global";
const SESSION_ISOLATION: SessionIsolation =
  (process.env.SESSION_ISOLATION as SessionIsolation) || "channel";

// ── Session management (#31 + #33) ───────────────────────────────────────────
// Sessions map a computed key to a Letta session with an active cloud sandbox.
// The sandbox handles tool execution (bash, file I/O, etc.).
// Session keys depend on SESSION_ISOLATION:
//   "user"    → "{userId}:{channelId}" (per-user per-channel)
//   "channel" → "{channelId}"          (per-channel, default)
//   "global"  → "global"               (single shared session)
const sessionCache = new Map<string, LettaCodeSession>();

// Pending approval callbacks: maps a unique key to a resolver
// that the Discord button handler will call with the user's decision.
export type ApprovalDecision = { allow: boolean; message?: string };
type ApprovalResolver = (decision: ApprovalDecision) => void;
const pendingApprovals = new Map<string, {
  resolve: (d: ApprovalDecision) => void;
  timeout: ReturnType<typeof setTimeout>;
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionKey: string;
}>();

function approvalDecisionToResponse(d: ApprovalDecision): CanUseToolResponse {
  if (d.allow) {
    return { behavior: "allow" };
  }
  return { behavior: "deny", message: d.message ?? "Denied by user" };
}

function resolveSessionKey(
  channelId: string,
  userId?: string,
): string {
  switch (SESSION_ISOLATION) {
    case "user":
      return userId ? `${userId}:${channelId}` : channelId;
    case "global":
      return "global";
    case "channel":
    default:
      return channelId;
  }
}

async function getSession(key: string): Promise<LettaCodeSession> {
  const existing = sessionCache.get(key);
  if (existing) return existing;

  console.log(`🆕 Creating Letta session (key=${key})`);
  const session = letta.createSession(AGENT_ID, {
    permissionMode: ENABLE_TOOL_APPROVAL ? "standard" : "unrestricted",
    canUseTool: ENABLE_TOOL_APPROVAL
      ? (toolName, toolInput) => requestToolApproval(toolName, toolInput, key)
      : undefined,
  });
  sessionCache.set(key, session);
  return session;
}

// ── Sandbox lifecycle: close all sessions on shutdown (#31) ──────────────────
export async function closeSessions(): Promise<void> {
  const keys = [...sessionCache.keys()];
  console.log(`🧹 Closing ${keys.length} Letta session(s)...`);
  for (const key of keys) {
    const session = sessionCache.get(key);
    if (session) {
      try {
        await session.close();
      } catch {
        // best-effort: session may already be closed
      }
    }
  }
  sessionCache.clear();
  console.log("✅ All sessions closed");
}

// ── Sandbox lifecycle: recover from expired sandbox (#31) ────────────────────
async function getSessionWithRecovery(
  key: string,
): Promise<LettaCodeSession> {
  const existing = sessionCache.get(key);
  if (existing) return existing;
  return getSession(key);
}

async function sendMessageWithRetry(
  fullMessage: string,
  sessionKey: string,
  attempt = 0,
): Promise<string> {
  try {
    const session = await getSessionWithRecovery(sessionKey);
    await session.send(fullMessage);
    return await streamAssistantText(session);
  } catch (error) {
    if (
      error instanceof CloudManagedSandboxExpiredError &&
      attempt < 1
    ) {
      console.warn(
        `⚠️ Sandbox expired for session ${sessionKey}, recreating...`,
      );
      sessionCache.delete(sessionKey);
      return sendMessageWithRetry(fullMessage, sessionKey, attempt + 1);
    }
    throw error;
  }
}

// ── Tool approval via Discord (#32) ──────────────────────────────────────────
// Maps a unique approval key to Discord message/channel info so the button
// handler can post the approval prompt and resolve the callback.
export interface ApprovalInfo {
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionKey: string;
  channel: OmitPartialGroupDMChannel<Message<boolean>>;
  message: OmitPartialGroupDMChannel<Message<boolean>>;
}

const pendingApprovalMessages = new Map<string, ApprovalInfo>();

export function getApprovalInfo(key: string): ApprovalInfo | undefined {
  return pendingApprovalMessages.get(key);
}

export function resolveApproval(
  key: string,
  decision: ApprovalDecision,
): boolean {
  const pending = pendingApprovals.get(key);
  if (!pending) return false;

  clearTimeout(pending.timeout);
  pending.resolve(decision);
  pendingApprovals.delete(key);
  pendingApprovalMessages.delete(key);
  console.log(
    `✅ Tool approval resolved: ${decision.allow ? "allow" : "deny"} for ${pending.toolName}`,
  );
  return true;
}

function requestToolApproval(
  toolName: string,
  toolInput: Record<string, unknown>,
  sessionKey: string,
): Promise<CanUseToolResponse> {
  return new Promise((promiseResolve) => {
    const approvalKey = `${sessionKey}:${toolName}:${Date.now()}`;

    const timeout = setTimeout(() => {
      pendingApprovals.delete(approvalKey);
      pendingApprovalMessages.delete(approvalKey);
      console.log(`⏰ Tool approval timed out for ${toolName}, denying`);
      promiseResolve({ behavior: "deny", message: "Approval timed out" });
    }, TOOL_APPROVAL_TIMEOUT_MS);

    pendingApprovals.set(approvalKey, {
      resolve: (d: ApprovalDecision) =>
        promiseResolve(approvalDecisionToResponse(d)),
      timeout,
      toolName,
      toolInput,
      sessionKey,
    });

    console.log(
      `🔔 Tool approval requested: ${toolName} (key=${approvalKey})`,
    );
  });
}

export function getPendingApprovalKey(sessionKey: string): string | undefined {
  for (const [key, pending] of pendingApprovals) {
    if (pending.sessionKey === sessionKey) return key;
  }
  return undefined;
}

// ── Message types ──────────────────────────────────────────────────────────
export enum MessageType {
  DM = "DM",
  MENTION = "MENTION",
  REPLY = "REPLY",
  GENERIC = "GENERIC",
}

// ── Format prefix for a message type ─────────────────────────────────────
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

// ── Image handling ───────────────────────────────────────────────────────
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

// ── Stream assistant text from a Letta session turn ──────────────────────
async function streamAssistantText(
  session: LettaCodeSession,
): Promise<string> {
  const parts: string[] = [];
  for await (const message of session.stream()) {
    if (message.type === "assistant") {
      parts.push(message.content);
    }
    // Reasoning and tool_call events are processed server-side;
    // we only need the final assistant text for Discord.
  }
  return parts.join("");
}

// ── Send raw message string to Letta ──────────────────────────────────────
export async function sendMessageRaw(
  fullMessage: string,
  images: ImageContentBlock[] = [],
  sessionKey: string = "default",
): Promise<string> {
  if (!AGENT_ID) {
    throw new Error("LETTA_AGENT_ID not set");
  }

  // Build content: text + optional images
  let content: string | any[];
  if (images.length > 0) {
    content = [{ type: "text", text: fullMessage }, ...images];
  } else {
    content = fullMessage;
  }

  console.log(
    `📤 Sending to Letta (agent=${AGENT_ID}, session=${sessionKey}): ${fullMessage.substring(0, 100)}...` +
    (images.length > 0 ? ` (+${images.length} images)` : ""),
  );

  const session = await getSessionWithRecovery(sessionKey);
  await session.send(content);
  const reply = await streamAssistantText(session);

  console.log(`📥 Letta responded (${reply.length} chars)`);
  return reply;
}

// ── Send message to Letta and get response ─────────────────────────────────
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

  // Compute session key based on isolation mode (#33)
  const sessionKey = resolveSessionKey(message.channel.id, userId);

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
  return sendMessageRaw(fullMessage, images, sessionKey);
}

// ── Send timer/heartbeat message to Letta ────────────────────────────────
export async function sendTimerMessage(): Promise<string> {
  if (!AGENT_ID) {
    throw new Error("LETTA_AGENT_ID not set");
  }

  const fullMessage =
    "[Timer event] This is a periodic heartbeat. Check if there is anything you should proactively do, such as updating your memory, following up on tasks, or initiating a conversation. If there is nothing to do, respond with an empty string.";

  console.log(`📤 Sending timer heartbeat to Letta (agent=${AGENT_ID})`);
  return sendMessageRaw(fullMessage, [], "timer");
}

// ── Message splitting (Discord 2000 char limit) ────────────────────────────
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
