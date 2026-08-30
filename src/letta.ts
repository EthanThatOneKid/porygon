import { spawn, type ChildProcess } from "node:child_process";

let lettaProcess: ChildProcess | null = null;

/**
 * Check if the Letta server is currently running.
 */
export function isLettaRunning(): boolean {
  return lettaProcess !== null && lettaProcess.exitCode === null;
}

/**
 * Boot the Letta server as a child process.
 *
 * Spawns `letta server --channels discord --backend cloud` in the
 * background. The process is kept alive for the lifetime of this Node.js
 * process. Only one instance is spawned; subsequent calls are no-ops if
 * the process is still running.
 *
 * Environment variables required:
 * - DISCORD_PUBLIC_KEY — used by the interactions endpoint (already checked)
 * - Letta Cloud auth — must be configured via `letta setup` beforehand
 */
export async function bootLetta(): Promise<void> {
  if (isLettaRunning()) {
    console.log("[letta] Already running, skipping boot.");
    return;
  }

  console.log("[letta] Spawning letta server...");

  const env = { ...process.env };

  lettaProcess = spawn(
    "letta",
    ["server", "--channels", "discord", "--backend", "cloud"],
    {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    },
  );

  lettaProcess.stdout?.on("data", (data: Buffer) => {
    console.log("[letta:stdout]", data.toString().trim());
  });

  lettaProcess.stderr?.on("data", (data: Buffer) => {
    console.error("[letta:stderr]", data.toString().trim());
  });

  lettaProcess.on("exit", (code, signal) => {
    console.log(`[letta] Process exited (code=${code}, signal=${signal})`);
    lettaProcess = null;
  });

  lettaProcess.on("error", (err) => {
    console.error("[letta] Failed to spawn:", err.message);
    lettaProcess = null;
  });

  // Give it a moment to start
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (isLettaRunning()) {
    console.log("[letta] Server started successfully.");
  } else {
    console.warn("[letta] Server may have failed to start. Check logs.");
  }
}

/**
 * Gracefully shut down the Letta server.
 */
export function shutdownLetta(): void {
  if (lettaProcess && isLettaRunning()) {
    console.log("[letta] Shutting down...");
    lettaProcess.kill("SIGTERM");
  }
}
