import { describe, it, expect } from "vitest";
import { splitMessage } from "./messages.js";

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
});
