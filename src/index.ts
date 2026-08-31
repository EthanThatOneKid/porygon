import "dotenv/config";
import express from "express";
import {
  Client,
  GatewayIntentBits,
  Message,
  OmitPartialGroupDMChannel,
  Partials,
} from "discord.js";
import { sendMessage, MessageType, splitMessage } from "./messages.js";

// ── Configuration ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const RESPOND_TO_DMS = process.env.RESPOND_TO_DMS !== "false"; // default true
const RESPOND_TO_MENTIONS = process.env.RESPOND_TO_MENTIONS !== "false"; // default true
const RESPOND_TO_BOTS = process.env.RESPOND_TO_BOTS === "true"; // default false
const RESPOND_TO_GENERIC = process.env.RESPOND_TO_GENERIC === "true"; // default false
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID; // optional: only listen in this channel
const SURFACE_ERRORS = process.env.SURFACE_ERRORS === "true";

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

client.once("clientReady", () => {
  console.log(`🤖 Logged in as ${client.user?.tag}!`);
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
    await processMessage(
      message,
      isReplyToBot ? MessageType.REPLY : MessageType.MENTION,
    );
    return;
  }

  // Generic messages
  if (RESPOND_TO_GENERIC) {
    console.log(
      `📩 Generic from ${message.author.username}: ${message.content}`,
    );
    await processMessage(message, MessageType.GENERIC);
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
  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) {
      await message.reply(chunks[i]);
    } else {
      await message.channel.send(chunks[i]);
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
