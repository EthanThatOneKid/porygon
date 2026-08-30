import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApp } from "./server.js";
import http from "node:http";
import type { Server } from "node:http";

// Mock tweetnacl
vi.mock("tweetnacl", () => ({
  default: {
    sign: {
      detached: {
        verify: vi.fn(),
      },
    },
  },
}));

// Mock letta module
let mockRunning = false;
vi.mock("./letta.js", () => ({
  isLettaRunning: vi.fn(() => mockRunning),
  bootLetta: vi.fn(async () => {
    mockRunning = true;
  }),
}));

function makeRequest(
  server: Server,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as any)?.port;
    const reqHeaders: Record<string, string> = {
      host: `localhost:${port}`,
      ...headers,
    };

    if (body !== undefined) {
      reqHeaders["content-length"] = Buffer.byteLength(body).toString();
    }

    const req = http.request(
      {
        hostname: "localhost",
        port,
        method,
        path,
        headers: reqHeaders,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            data: Buffer.concat(chunks).toString("utf-8"),
          });
        });
      },
    );

    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

describe("server", () => {
  let server: Server;

  beforeEach(async () => {
    mockRunning = false;
    vi.clearAllMocks();
    process.env.DISCORD_PUBLIC_KEY = "test-public-key";
    server = createApp();
    await new Promise<void>((resolve) => server.listen(0, resolve));
  });

  afterEach(async () => {
    delete process.env.DISCORD_PUBLIC_KEY;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe("GET /healthz", () => {
    it("returns 200 with status ok", async () => {
      const res = await makeRequest(server, "GET", "/healthz");
      expect(res.status).toBe(200);
      const body = JSON.parse(res.data);
      expect(body.status).toBe("ok");
      expect(body.letta).toBe("idle");
      expect(typeof body.uptime).toBe("number");
    });
  });

  describe("POST /interactions", () => {
    it("returns 401 for missing signature headers", async () => {
      const res = await makeRequest(server, "POST", "/interactions", {}, "{}");
      expect(res.status).toBe(401);
    });

    it("returns 401 for invalid signature", async () => {
      const nacl = (await import("tweetnacl")).default;
      (nacl.sign.detached.verify as any).mockReturnValue(false);

      const res = await makeRequest(
        server,
        "POST",
        "/interactions",
        {
          "x-signature-ed25519": "invalid",
          "x-signature-timestamp": "1234567890",
        },
        "{}",
      );
      expect(res.status).toBe(401);
    });

    it("responds PONG to PING interaction", async () => {
      const nacl = (await import("tweetnacl")).default;
      (nacl.sign.detached.verify as any).mockReturnValue(true);

      const pingPayload = JSON.stringify({ type: 1 });
      const res = await makeRequest(
        server,
        "POST",
        "/interactions",
        {
          "x-signature-ed25519": "valid-sig",
          "x-signature-timestamp": "1234567890",
        },
        pingPayload,
      );
      expect(res.status).toBe(200);
      const body = JSON.parse(res.data);
      expect(body.type).toBe(1); // PONG
    });

    it("defers response and boots Letta on command interaction", async () => {
      const nacl = (await import("tweetnacl")).default;
      (nacl.sign.detached.verify as any).mockReturnValue(true);
      const { bootLetta } = await import("./letta.js");

      const commandPayload = JSON.stringify({
        type: 2, // APPLICATION_COMMAND
        data: { name: "Turn On Porygon" },
      });

      const res = await makeRequest(
        server,
        "POST",
        "/interactions",
        {
          "x-signature-ed25519": "valid-sig",
          "x-signature-timestamp": "1234567890",
        },
        commandPayload,
      );
      expect(res.status).toBe(200);
      const body = JSON.parse(res.data);
      expect(body.type).toBe(5); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
      expect(bootLetta).toHaveBeenCalled();
    });

    it("acks unknown interaction types", async () => {
      const nacl = (await import("tweetnacl")).default;
      (nacl.sign.detached.verify as any).mockReturnValue(true);

      const payload = JSON.stringify({ type: 99 });
      const res = await makeRequest(
        server,
        "POST",
        "/interactions",
        {
          "x-signature-ed25519": "valid-sig",
          "x-signature-timestamp": "1234567890",
        },
        payload,
      );
      expect(res.status).toBe(200);
      const body = JSON.parse(res.data);
      expect(body.type).toBe(6); // ACK
    });
  });

  describe("404", () => {
    it("returns 404 for unknown routes", async () => {
      const res = await makeRequest(server, "GET", "/unknown");
      expect(res.status).toBe(404);
    });
  });
});
