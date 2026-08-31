import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import nacl from "tweetnacl";
import {
  Client,
  GatewayIntentBits,
  Interaction,
  Message,
  OmitPartialGroupDMChannel,
  Partials,
  ApplicationCommandType,
} from "discord.js";
import { sendMessage, sendMessageRaw, sendTimerMessage, MessageType, splitMessage, formatPrefix } from "./messages.js";

// ── Configuration ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const RESPOND_TO_DMS = process.env.RESPOND_TO_DMS !== "false"; // default true
const RESPOND_TO_MENTIONS = process.env.RESPOND_TO_MENTIONS !== "false"; // default true
const RESPOND_TO_BOTS = process.env.RESPOND_TO_BOTS === "true"; // default false
const RESPOND_TO_GENERIC = process.env.RESPOND_TO_GENERIC === "true"; // default false
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID; // optional: only listen in this channel
const SURFACE_ERRORS = process.env.SURFACE_ERRORS === "true";
const MESSAGE_BATCH_ENABLED = process.env.MESSAGE_BATCH_ENABLED === "true";
const MESSAGE_BATCH_SIZE = parseInt(
  process.env.MESSAGE_BATCH_SIZE || "10",
  10,
);
const MESSAGE_BATCH_TIMEOUT_MS = parseInt(
  process.env.MESSAGE_BATCH_TIMEOUT_MS || "30000",
  10,
);
const REPLY_IN_THREADS = process.env.REPLY_IN_THREADS === "true";
const ENABLE_THREAD_CONVERSATIONS =
  process.env.ENABLE_THREAD_CONVERSATIONS === "true";
const THREAD_CONVERSATIONS_RESPOND_WITHOUT_MENTION =
  process.env.THREAD_CONVERSATIONS_RESPOND_WITHOUT_MENTION === "true";
const ENABLE_TIMER = process.env.ENABLE_TIMER === "true";
const TIMER_INTERVAL_MINUTES = parseInt(
  process.env.TIMER_INTERVAL_MINUTES || "15",
  10,
);
const FIRING_PROBABILITY = parseFloat(
  process.env.FIRING_PROBABILITY || "0.1",
);
const INTERACTION_PUBLIC_KEY = process.env.INTERACTION_PUBLIC_KEY || "";

// ── Environment check ──────────────────────────────────────────────────────────
console.log("🚀 Starting Porygon...");
console.log("📋 Environment:");
console.log(`  DISCORD_TOKEN: ${process.env.DISCORD_TOKEN ? "✓" : "✗"}`);
console.log(`  LETTA_API_KEY: ${process.env.LETTA_API_KEY ? "✓" : "✗"}`);
console.log(`  LETTA_AGENT_ID: ${process.env.LETTA_AGENT_ID || "(will create)"}`);
console.log(`  LETTA_BASE_URL: ${process.env.LETTA_BASE_URL || "https://api.letta.com"}`);

// ── Discord client ─────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled rejection:", err);
});
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught exception:", err);
  process.exit(1);
});
client.on("error", (err) => {
  console.error("🛑 Discord client error:", err);
});

client.once("clientReady", async () => {
  console.log(`🤖 Logged in as ${client.user?.tag}!`);
  if (MESSAGE_BATCH_ENABLED) {
    console.log(
      `📦 Message batching enabled: ${MESSAGE_BATCH_SIZE} messages or ${MESSAGE_BATCH_TIMEOUT_MS}ms timeout`,
    );
  }
  if (ENABLE_TIMER) {
    console.log(
      `⏰ Timer enabled: interval=${TIMER_INTERVAL_MINUTES}min, probability=${FIRING_PROBABILITY}`,
    );
    startRandomEventTimer();
  }

  // Register context menu command
  await registerContextMenuCommand();
});

// ── Context menu command registration ──────────────────────────────────────
async function registerContextMenuCommand() {
  if (!process.env.DISCORD_TOKEN || !client.user?.id) {
    console.warn("⚠️  Cannot register commands: missing token or client ID");
    return;
  }

  const appId = client.user.id;
  const commandBody = [{
    name: "Start Porygon",
    type: 2, // ApplicationCommandType.User
  }];

  try {
    console.log("📋 Registering context menu command...");

    const res = await fetch(
      `https://discord.com/api/v10/applications/${appId}/commands`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commandBody),
      },
    );
    const data = await res.json();
    if (!res.ok) {
      console.error("❌ Failed to register context menu command:", JSON.stringify(data, null, 2));
    } else {
      console.log("✅ Context menu command registered");
    }
  } catch (err) {
    console.error("❌ Failed to register context menu command:", err);
  }
}

// ── Timer/heartbeat ──────────────────────────────────────────────────────────
async function startRandomEventTimer() {
  if (!ENABLE_TIMER) return;

  const minMinutes = 1;
  const randomMinutes =
    minMinutes +
    Math.floor(Math.random() * (TIMER_INTERVAL_MINUTES - minMinutes));
  console.log(`⏰ Timer scheduled to fire in ${randomMinutes} minutes`);

  const delay = randomMinutes * 60 * 1000;
  setTimeout(async () => {
    console.log(`⏰ Timer fired after ${randomMinutes} minutes`);

    if (Math.random() < FIRING_PROBABILITY) {
      console.log(
        `⏰ Random event triggered (${FIRING_PROBABILITY * 100}% chance)`,
      );

      try {
        const msg = await sendTimerMessage();
        if (msg && CHANNEL_ID) {
          const channel = await client.channels.fetch(CHANNEL_ID);
          if (channel && "send" in channel) {
            const chunks = splitMessage(msg);
            for (const chunk of chunks) {
              await (channel as any).send(chunk);
            }
            console.log(`⏰ Timer message sent to channel (${msg.length} chars)`);
          }
        }
      } catch (err) {
        console.error(`⏰ Error sending timer message:`, err);
      }
    } else {
      console.log(
        `⏰ Random event not triggered (${(1 - FIRING_PROBABILITY) * 100}% chance)`,
      );
    }

    // Schedule next timer
    setTimeout(() => startRandomEventTimer(), 1000);
  }, delay);
}

// ── Message batching ─────────────────────────────────────────────────────────
interface BatchedMessage {
  message: OmitPartialGroupDMChannel<Message<boolean>>;
  messageType: MessageType;
  timestamp: number;
}

const channelMessageBuffers = new Map<string, BatchedMessage[]>();
const channelBatchTimers = new Map<string, NodeJS.Timeout>();

async function drainMessageBatch(channelId: string) {
  const buffer = channelMessageBuffers.get(channelId);
  const timer = channelBatchTimers.get(channelId);
  if (timer) {
    clearTimeout(timer);
    channelBatchTimers.delete(channelId);
  }
  if (!buffer || buffer.length === 0) return;

  console.log(
    `📦 Draining batch for channel ${channelId}: ${buffer.length} messages`,
  );

  const lastMessage = buffer[buffer.length - 1].message;
  const channelName =
    "name" in lastMessage.channel && lastMessage.channel.name
      ? `#${lastMessage.channel.name}`
      : `channel ${channelId}`;

  const batchedContent = buffer
    .map((bm, idx) => {
      const { message: msg, messageType } = bm;
      const timestamp = new Date(bm.timestamp).toISOString();
      const prefix = formatPrefix(
        msg.author.username,
        msg.author.id,
        messageType,
        channelName,
      );
      return `${idx + 1}. [${timestamp}] ${prefix} ${msg.content}`;
    })
    .join("\n");

  const fullMessage = `[Batch of ${buffer.length} messages from ${channelName}]\n${batchedContent}`;
  console.log(`📦 Batch content:\n${fullMessage.substring(0, 500)}...`);

  try {
    const reply = await sendMessageRaw(fullMessage);
    if (reply) {
      await sendSplitReply(lastMessage, reply);
    }
  } catch (err) {
    console.error("🛑 Error processing batch:", err);
    if (SURFACE_ERRORS) {
      await lastMessage
        .reply(`❌ Error processing batch: ${(err as Error).message}`)
        .catch(() => {});
    }
  }

  channelMessageBuffers.delete(channelId);
}

function addMessageToBatch(
  message: OmitPartialGroupDMChannel<Message<boolean>>,
  messageType: MessageType,
) {
  const channelId = message.channel.id;
  if (!channelMessageBuffers.has(channelId)) {
    channelMessageBuffers.set(channelId, []);
  }
  const buffer = channelMessageBuffers.get(channelId)!;
  buffer.push({ message, messageType, timestamp: Date.now() });
  console.log(
    `📦 Added message to batch (${buffer.length}/${MESSAGE_BATCH_SIZE})`,
  );

  if (buffer.length >= MESSAGE_BATCH_SIZE) {
    console.log(`📦 Batch size limit reached, draining...`);
    drainMessageBatch(channelId);
    return;
  }

  if (channelBatchTimers.has(channelId)) {
    clearTimeout(channelBatchTimers.get(channelId)!);
  }
  const timeout = setTimeout(() => {
    console.log(`📦 Batch timeout reached, draining...`);
    drainMessageBatch(channelId);
  }, MESSAGE_BATCH_TIMEOUT_MS);
  channelBatchTimers.set(channelId, timeout);
}

// ── Interaction handler (context menu commands via WebSocket) ────────────────
client.on("interactionCreate", async (interaction: Interaction) => {
  if (!interaction.isContextMenuCommand()) return;

  const commandName = interaction.commandName;
  console.log(`📋 Context menu command: ${commandName}`);

  if (commandName === "Start Porygon") {
    await interaction.reply({
      content: client.isReady()
        ? "✅ Porygon is already online!"
        : "🔌 Waking up Porygon...",
      ephemeral: true,
    });
  }
});

// ── Message handler ────────────────────────────────────────────────────────────
client.on("messageCreate", async (message) => {
  // Ignore self
  if (message.author.id === client.user?.id) return;

  // Ignore other bots (unless configured)
  if (message.author.bot && !RESPOND_TO_BOTS) return;

  // Ignore commands
  if (message.content.startsWith("!")) return;

  // Channel filter
  if (CHANNEL_ID && message.channel.id !== CHANNEL_ID) return;

  // Thread conversations: handle ALL messages in thread uniformly
  if (
    ENABLE_THREAD_CONVERSATIONS &&
    THREAD_CONVERSATIONS_RESPOND_WITHOUT_MENTION &&
    message.channel.isThread()
  ) {
    let messageType = MessageType.GENERIC;
    const isMentionInThread = message.mentions.has(client.user || "");
    if (isMentionInThread) {
      messageType = MessageType.MENTION;
    } else if (message.reference?.messageId) {
      try {
        const repliedTo = await message.channel.messages.fetch(
          message.reference.messageId,
        );
        if (repliedTo.author.id === client.user?.id) {
          messageType = MessageType.REPLY;
        }
      } catch {
        // ignore
      }
    }
    console.log(
      `📩 Thread conversation (${messageType}) from ${message.author.username}: ${message.content}`,
    );
    if (MESSAGE_BATCH_ENABLED) {
      addMessageToBatch(message, messageType);
    } else {
      await processMessage(message, messageType);
    }
    return;
  }

  // DMs
  if (message.guild === null) {
    if (RESPOND_TO_DMS) {
      console.log(`📩 DM from ${message.author.username}: ${message.content}`);
      await processMessage(message, MessageType.DM);
    }
    return;
  }

  // Mentions and replies
  const isMention = message.mentions.has(client.user || "");
  let isReplyToBot = false;

  if (message.reference?.messageId) {
    try {
      const replied = await message.channel.messages.fetch(
        message.reference.messageId,
      );
      isReplyToBot = replied.author.id === client.user?.id;
    } catch {
      // ignore fetch errors
    }
  }

  if (RESPOND_TO_MENTIONS && (isMention || isReplyToBot)) {
    console.log(
      `📩 ${isReplyToBot ? "Reply" : "Mention"} from ${message.author.username}: ${message.content}`,
    );
    const type = isReplyToBot ? MessageType.REPLY : MessageType.MENTION;
    if (MESSAGE_BATCH_ENABLED) {
      addMessageToBatch(message, type);
    } else {
      await processMessage(message, type);
    }
    return;
  }

  // Generic messages
  if (RESPOND_TO_GENERIC) {
    console.log(
      `📩 Generic from ${message.author.username}: ${message.content}`,
    );
    if (MESSAGE_BATCH_ENABLED) {
      addMessageToBatch(message, MessageType.GENERIC);
    } else {
      await processMessage(message, MessageType.GENERIC);
    }
  }
});

async function processMessage(
  message: OmitPartialGroupDMChannel<Message<boolean>>,
  messageType: MessageType,
) {
  try {
    await message.channel.sendTyping();
    const reply = await sendMessage(message, messageType);
    if (reply) {
      await sendSplitReply(message, reply);
    }
  } catch (err) {
    console.error("🛑 Error processing message:", err);
    if (SURFACE_ERRORS) {
      await message.reply(`❌ Error: ${(err as Error).message}`).catch(() => {});
    }
  }
}

async function sendSplitReply(
  message: OmitPartialGroupDMChannel<Message<boolean>>,
  content: string,
) {
  const chunks = splitMessage(content);

  if (REPLY_IN_THREADS && message.guild !== null) {
    let thread;
    if (message.channel.isThread()) {
      thread = message.channel;
    } else if (message.hasThread && message.thread) {
      thread = message.thread;
    } else {
      const threadName = message.cleanContent.substring(0, 50) || "Chat";
      thread = await message.startThread({ name: threadName });
    }
    if (thread) {
      for (const chunk of chunks) {
        await thread.send(chunk);
      }
    }
  } else {
    for (let i = 0; i < chunks.length; i++) {
      if (i === 0) {
        await message.reply(chunks[i]);
      } else {
        await message.channel.send(chunks[i]);
      }
    }
  }
}

// ── Express (health check only) ────────────────────────────────────────────────
const app = express();

app.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    discord: !process.env.DISCORD_TOKEN
      ? "no-token"
      : client.isReady()
        ? "connected"
        : "disconnected",
    uptime: process.uptime(),
  });
});

app.get("/", (_req, res) => {
  res.json({ name: "porygon", version: "0.2.0" });
});

// ── Discord Interactions Endpoint ─────────────────────────────────────────────
// This endpoint receives interactions via HTTP POST from Discord.
// It's used to wake up the bot on Render's free tier when someone
// uses the context menu command.
//
// Discord verification: sends a PING (type=1) when you set the endpoint URL.
// Must respond with {"type": 1} within 3 seconds.
app.post("/interactions", (req: Request, res: Response) => {
  // Collect raw body for signature verification
  let rawBody = "";
  req.on("data", (chunk) => {
    rawBody += chunk.toString();
  });
  req.on("end", () => {
    const signature = req.headers["x-signature-ed25519"] as string;
    const timestamp = req.headers["x-signature-timestamp"] as string;

    // Verify signature if public key is set
    if (INTERACTION_PUBLIC_KEY && signature && timestamp) {
      try {
        const isValid = nacl.sign.detached.verify(
          new TextEncoder().encode(timestamp + rawBody),
          Uint8Array.from(Buffer.from(signature, "hex")),
          Uint8Array.from(Buffer.from(INTERACTION_PUBLIC_KEY, "hex")),
        );
        if (!isValid) {
          console.warn("⚠️  Invalid interaction signature");
          res.status(401).json({ error: "Invalid request signature" });
          return;
        }
      } catch (err) {
        console.error("❌ Signature verification error:", err);
        res.status(401).json({ error: "Signature verification failed" });
        return;
      }
    }

    let interaction;
    try {
      interaction = JSON.parse(rawBody);
    } catch (err) {
      console.error("❌ Failed to parse interaction body:", err);
      res.status(400).json({ error: "Invalid JSON" });
      return;
    }

    // Handle PING (Discord verification)
    if (interaction.type === 1) {
      console.log("🏓 Interaction PING received");
      res.json({ type: 1 });
      return;
    }

    // Handle context menu command
    if (interaction.type === 2) {
      const commandName = interaction.data?.name;
      console.log(`📋 Context menu command: ${commandName}`);

      // "Start Porygon" context menu command
      if (commandName === "Start Porygon") {
        // Respond immediately, then connect to Discord if not already
        if (!client.isReady()) {
          console.log("🔌 Waking up - connecting to Discord...");
          client.login(process.env.DISCORD_TOKEN || "").catch((err) => {
            console.error("❌ Failed to connect to Discord:", err);
          });
        }

        res.json({
          type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
          data: {
            content: client.isReady()
              ? "✅ Porygon is already online!"
              : "🔌 Waking up Porygon...",
          },
        });
        return;
      }
    }

    // Unknown interaction type - respond with PONG
    res.json({ type: 1 });
  });
});

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`🌐 Express listening on :${PORT}`);

  if (!process.env.DISCORD_TOKEN) {
    console.warn("⚠️  DISCORD_TOKEN not set — Discord is disabled. Set the token to connect.");
    return;
  }

  try {
    await client.login(process.env.DISCORD_TOKEN);
    console.log("✅ Discord gateway connected");
  } catch (err) {
    console.error("❌ Discord login failed:", err);
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("👋 SIGTERM received, shutting down...");
  client.destroy();
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("👋 SIGINT received, shutting down...");
  client.destroy();
  process.exit(0);
});
