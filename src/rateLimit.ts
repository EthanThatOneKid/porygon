// ── Rate limiting (#38) ──────────────────────────────────────────────────────
// In-memory token bucket rate limiter with per-user and per-channel tracking.
// Prevents spam and credit exhaustion when bot is on public servers.

export interface RateLimitConfig {
  /** Enable rate limiting (default: false) */
  enabled: boolean;
  /** Max messages per user per window (default: 10) */
  userMaxMessages: number;
  /** User window duration in ms (default: 60000 = 1 minute) */
  userWindowMs: number;
  /** Max messages per channel per window (default: 30) */
  channelMaxMessages: number;
  /** Channel window duration in ms (default: 60000 = 1 minute) */
  channelWindowMs: number;
  /** Max messages per user per channel per window (default: 5) */
  userChannelMaxMessages: number;
  /** User-channel window duration in ms (default: 30000 = 30 seconds) */
  userChannelWindowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  enabled: process.env.RATE_LIMIT_ENABLED === "true",
  userMaxMessages: parseInt(process.env.RATE_LIMIT_MAX_MESSAGES || "10", 10),
  userWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  channelMaxMessages: parseInt(
    process.env.RATE_LIMIT_CHANNEL_MAX_MESSAGES || "30",
    10,
  ),
  channelWindowMs: parseInt(
    process.env.RATE_LIMIT_CHANNEL_WINDOW_MS || "60000",
    10,
  ),
  userChannelMaxMessages: parseInt(
    process.env.RATE_LIMIT_USER_CHANNEL_MAX_MESSAGES || "5",
    10,
  ),
  userChannelWindowMs: parseInt(
    process.env.RATE_LIMIT_USER_CHANNEL_WINDOW_MS || "30000",
    10,
  ),
};

// ── Sliding window counter ───────────────────────────────────────────────
// Simpler than token bucket for message counting: tracks timestamps of
// recent messages and evicts expired ones on each check.

interface SlidingWindow {
  timestamps: number[];
}

function isRateLimited(window: SlidingWindow, max: number, windowMs: number): {
  limited: boolean;
  retryAfterMs: number;
} {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Evict expired timestamps
  window.timestamps = window.timestamps.filter((t) => t > cutoff);

  if (window.timestamps.length >= max) {
    // Rate limited: retry after oldest surviving timestamp expires
    const oldest = window.timestamps[0];
    const retryAfterMs = oldest + windowMs - now;
    return { limited: true, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  // Not limited: record this message
  window.timestamps.push(now);
  return { limited: false, retryAfterMs: 0 };
}

// ── Rate limit state ────────────────────────────────────────────────────
const userWindows = new Map<string, SlidingWindow>();
const channelWindows = new Map<string, SlidingWindow>();
const userChannelWindows = new Map<string, SlidingWindow>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  reason?: string;
}

/**
 * Check rate limits for a message. Returns { allowed: true } if the message
 * should be processed, or { allowed: false, retryAfterMs, reason } if blocked.
 */
export function checkRateLimit(
  userId: string,
  channelId: string,
  config: RateLimitConfig = DEFAULT_CONFIG,
): RateLimitResult {
  if (!config.enabled) {
    return { allowed: true };
  }

  // Check per-user limit
  let userWindow = userWindows.get(userId);
  if (!userWindow) {
    userWindow = { timestamps: [] };
    userWindows.set(userId, userWindow);
  }
  const userCheck = isRateLimited(
    userWindow,
    config.userMaxMessages,
    config.userWindowMs,
  );
  if (userCheck.limited) {
    return {
      allowed: false,
      retryAfterMs: userCheck.retryAfterMs,
      reason: "user",
    };
  }

  // Check per-channel limit
  let channelWindow = channelWindows.get(channelId);
  if (!channelWindow) {
    channelWindow = { timestamps: [] };
    channelWindows.set(channelId, channelWindow);
  }
  const channelCheck = isRateLimited(
    channelWindow,
    config.channelMaxMessages,
    config.channelWindowMs,
  );
  if (channelCheck.limited) {
    return {
      allowed: false,
      retryAfterMs: channelCheck.retryAfterMs,
      reason: "channel",
    };
  }

  // Check per-user-per-channel limit
  const ucKey = `${userId}:${channelId}`;
  let ucWindow = userChannelWindows.get(ucKey);
  if (!ucWindow) {
    ucWindow = { timestamps: [] };
    userChannelWindows.set(ucKey, ucWindow);
  }
  const ucCheck = isRateLimited(
    ucWindow,
    config.userChannelMaxMessages,
    config.userChannelWindowMs,
  );
  if (ucCheck.limited) {
    return {
      allowed: false,
      retryAfterMs: ucCheck.retryAfterMs,
      reason: "user-channel",
    };
  }

  return { allowed: true };
}

/**
 * Format a retry-after duration into a human-readable string.
 * e.g., 5000 → "5s", 90000 → "1m 30s"
 */
export function formatRetryAfter(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

/**
 * Get rate limit stats for debugging/monitoring.
 */
export function getRateLimitStats(): {
  users: number;
  channels: number;
  userChannels: number;
} {
  return {
    users: userWindows.size,
    channels: channelWindows.size,
    userChannels: userChannelWindows.size,
  };
}

/**
 * Reset all rate limit state (useful for testing or after config change).
 */
export function resetRateLimits(): void {
  userWindows.clear();
  channelWindows.clear();
  userChannelWindows.clear();
}
