import { startServer } from "./server.js";
import { shutdownLetta } from "./letta.js";

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[porygon] Received SIGTERM, shutting down...");
  shutdownLetta();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[porygon] Received SIGINT, shutting down...");
  shutdownLetta();
  process.exit(0);
});

startServer();
