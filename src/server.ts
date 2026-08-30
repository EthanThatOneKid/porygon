import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { verifyDiscordSignature } from "./discord.js";
import { bootLetta, isLettaRunning } from "./letta.js";

const PORT = Number(process.env.PORT) || 3000;
function getPublicKey(): string {
  return process.env.DISCORD_PUBLIC_KEY ?? "";
}

/**
 * Read the full body of an incoming request as a string.
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * Handle POST /interactions — Discord interactions endpoint.
 *
 * 1. Verify the request signature against DISCORD_PUBLIC_KEY.
 * 2. Parse the interaction payload.
 * 3. If it's a PING, respond immediately (Discord handshake).
 * 4. If it's a context menu command ("Turn On Porygon"), defer the
 *    response (type 5 = DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE) and boot
 *    the Letta server in the background.
 * 5. For any other interaction type, return an empty ACK.
 */
async function handleInteractions(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // --- Read body first (needed for both signature check and PING) ---
  const body = await readBody(req);

  // --- Signature verification ---
  const signature = req.headers["x-signature-ed25519"] as string | undefined;
  const timestamp = req.headers["x-signature-timestamp"] as string | undefined;

  // Discord's initial verification PING may arrive without signature headers.
  // Allow unsigned PINGs through; reject everything else without signatures.
  let isVerified = false;
  if (signature && timestamp && getPublicKey()) {
    isVerified = verifyDiscordSignature(body, signature, timestamp, getPublicKey());
  }

  // --- Parse interaction ---
  let interaction: Record<string, unknown>;
  try {
    interaction = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const type = interaction.type as number;

  // PING (type 1) — Discord verification handshake
  if (type === 1) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ type: 1 })); // PONG
    return;
  }

  // Reject unsigned non-PING interactions
  if (!isVerified) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid signature" }));
    return;
  }

  // APPLICATION_COMMAND (type 2)
  if (type === 2) {
    // Defer the response so we have time to boot Letta
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ type: 5 })); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE

    // Boot Letta in background if not already running
    if (!isLettaRunning()) {
      console.log("[interactions] Letta not running — booting in background...");
      bootLetta().catch((err) => {
        console.error("[interactions] Letta boot failed:", err);
      });
    } else {
      console.log("[interactions] Letta already running.");
    }

    return;
  }

  // Any other interaction type — ACK
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ type: 6 })); // ACK
}

/**
 * Handle GET /healthz — Render health check.
 */
function handleHealthz(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: "ok",
      letta: isLettaRunning() ? "running" : "idle",
      uptime: process.uptime(),
    }),
  );
}

/**
 * Create and return the HTTP server. Exported for testing.
 */
export function createApp() {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    // Only accept POST /interactions and GET /healthz
    if (req.method === "POST" && url.pathname === "/interactions") {
      try {
        await handleInteractions(req, res);
      } catch (err) {
        console.error("[interactions] Unhandled error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/healthz") {
      handleHealthz(req, res);
      return;
    }

    // 404 for everything else
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });
}

/**
 * Start the server. Called from src/index.ts.
 */
export function startServer(): void {
  const server = createApp();
  server.listen(PORT, () => {
    console.log(`[porygon] Listening on :${PORT}`);
    console.log(`[porygon] POST /interactions — Discord interactions endpoint`);
    console.log(`[porygon] GET  /healthz      — health check`);
  });
}
