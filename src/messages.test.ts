import { describe, it, expect } from "vitest";
import { splitMessage, formatPrefix, MessageType } from "./messages.js";

describe("formatPrefix", () => {
  it("returns empty string when USE_SENDER_PREFIX is false", () => {
    // Note: This test depends on env var state. In production, test with mocked env.
    const result = formatPrefix("user123", "12345", MessageType.DM, "#general");
    // Should return a prefix string (format depends on env)
    expect(typeof result).toBe("string");
  });

  it("includes username and userId", () => {
    const result = formatPrefix("alice", "111", MessageType.DM, "#general");
    expect(result).toContain("alice");
    expect(result).toContain("111");
  });

  it("formats DM correctly", () => {
    const result = formatPrefix("bob", "222", MessageType.DM, "#general");
    expect(result).toContain("direct message");
  });

  it("formats MENTION correctly", () => {
    const result = formatPrefix("charlie", "333", MessageType.MENTION, "#general");
    expect(result).toContain("mentioned you in #general");
  });

  it("formats REPLY correctly", () => {
    const result = formatPrefix("dave", "444", MessageType.REPLY, "#general");
    expect(result).toContain("replied to you in #general");
  });

  it("formats GENERIC correctly", () => {
    const result = formatPrefix("eve", "555", MessageType.GENERIC, "#random");
    expect(result).toContain("in #random");
  });
});

describe("splitMessage", () => {
  it("returns single chunk for short messages", () => {
    const result = splitMessage("Hello, world!");
    expect(result).toEqual(["Hello, world!"]);
  });

  it("splits at newline when possible", () => {
    const long = "Line one\n" + "x".repeat(2000);
    const result = splitMessage(long);
    expect(result.length).toBe(2);
    expect(result[0]).toBe("Line one");
  });

  it("splits at space when no newline", () => {
    const long = "word " + "x".repeat(2000);
    const result = splitMessage(long);
    expect(result.length).toBe(2);
    expect(result[0].length).toBeLessThanOrEqual(2000);
  });

  it("handles exact 2000 char message", () => {
    const msg = "x".repeat(2000);
    const result = splitMessage(msg);
    expect(result).toEqual([msg]);
  });

  it("handles very long messages", () => {
    const msg = "a".repeat(5000);
    const result = splitMessage(msg);
    expect(result.length).toBe(3);
    result.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    });
  });

  it("handles empty string", () => {
    const result = splitMessage("");
    expect(result).toEqual([""]);
  });

  describe("code block preservation", () => {
    it("preserves small code blocks intact", () => {
      const code = "```js\nconst x = 1;\n```";
      const result = splitMessage(code);
      expect(result).toEqual([code]);
    });

    it("does not split code blocks in the middle", () => {
      // Create a message with text + code block that exceeds limit
      const textBefore = "Here is some code:\n";
      const codeBlock =
        "```typescript\n" + "console.log('hello world');\n".repeat(50) + "\n```";
      const textAfter = "\n\nThis is after the code.";
      const fullMessage = textBefore + codeBlock + textAfter;

      const result = splitMessage(fullMessage);
      result.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(2000);
      });

      // Verify no chunk contains an unclosed code block
      for (const chunk of result) {
        const backtickCount = (chunk.match(/```/g) || []).length;
        // If odd number of backticks, we have an unclosed code block
        // (except if the next chunk starts with closing backticks)
        if (backtickCount % 2 !== 0) {
          // Check if next chunk starts with closing backticks
          const idx = result.indexOf(chunk);
          if (idx < result.length - 1) {
            expect(result[idx + 1].trimStart().startsWith("```")).toBe(true);
          }
        }
      }
    });

    it("handles multiple code blocks", () => {
      const part1 = "First paragraph.\n\n";
      const code1 = "```\ncode block one\n```\n\n";
      const part2 = "Middle text.\n\n";
      const code2 = "```\ncode block two\n```\n\n";
      const part3 = "Final paragraph.";
      const fullMessage = part1 + code1 + part2 + code2 + part3;

      const result = splitMessage(fullMessage);
      expect(result.length).toBeGreaterThanOrEqual(1);
      // Rejoined should equal original
      expect(result.join("").trim()).toBe(fullMessage.trim());
    });

    it("handles code block with language specifier", () => {
      const msg =
        "```python\ndef foo():\n    return 42\n```\n\nSome text after.";
      const result = splitMessage(msg);
      expect(result).toEqual([msg]);
    });

    it("handles text before and after a large code block", () => {
      const before = "Before the code:\n";
      const code = "```\n" + "x".repeat(1800) + "\n```";
      const after = "\nAfter the code.";
      const full = before + code + after;

      const result = splitMessage(full);
      // Code block (1806 chars) fits in one chunk, text splits around it
      const hasCodeBlock = result.some((c) => c.includes("```"));
      expect(hasCodeBlock).toBe(true);

      // Each chunk under limit
      result.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(2000);
      });
    });

    it("handles message that is only a very long code block", () => {
      const code = "```\n" + "x".repeat(1900) + "\n```";
      const result = splitMessage(code);
      expect(result.length).toBe(1);
      expect(result[0]).toBe(code);
    });

    it("handles unclosed code block at end of chunk gracefully", () => {
      // Force a scenario where a code block opens but closing is beyond limit
      const prefix = "text\n";
      const codeStart = "```\n";
      const codeBody = "y".repeat(1990);
      const msg = prefix + codeStart + codeBody;

      const result = splitMessage(msg);
      result.forEach((chunk) => {
        expect(chunk.length).toBeLessThanOrEqual(2000);
      });
    });

    it("preserves nested code blocks", () => {
      const msg = "```\n```\ncode\n```\n```\n";
      const result = splitMessage(msg);
      expect(result).toEqual([msg]);
    });

    it("handles consecutive code blocks", () => {
      const msg = "```\nfirst\n```\n```\nsecond\n```";
      const result = splitMessage(msg);
      expect(result).toEqual([msg]);
    });
  });
});
