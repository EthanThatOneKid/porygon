import { describe, it, expect, vi } from "vitest";
import { getOrCreateAgentId, AgentClient, AgentIdStore } from "./agent.js";

function createMockClient(existingIds: string[] = []): AgentClient {
  return {
    createAgent: vi.fn().mockResolvedValue("new-agent-id"),
    hasAgent: vi.fn().mockImplementation(async (id: string) => existingIds.includes(id)),
  };
}

function createMockStore(saved: string | null = null): AgentIdStore {
  const store: { value: string | null } = { value: saved };
  return {
    get: vi.fn().mockImplementation(async () => store.value),
    set: vi.fn().mockImplementation(async (id: string) => { store.value = id; }),
  };
}

describe("getOrCreateAgentId", () => {
  it("resumes existing agent when saved id is valid", async () => {
    const client = createMockClient(["existing-id"]);
    const store = createMockStore("existing-id");
    const id = await getOrCreateAgentId(client, store);
    expect(id).toBe("existing-id");
    expect(client.createAgent).not.toHaveBeenCalled();
  });

  it("creates new agent when no saved id", async () => {
    const client = createMockClient();
    const store = createMockStore(null);
    const id = await getOrCreateAgentId(client, store);
    expect(id).toBe("new-agent-id");
    expect(client.createAgent).toHaveBeenCalled();
    expect(store.set).toHaveBeenCalledWith("new-agent-id");
  });

  it("creates new agent when saved id no longer exists", async () => {
    const client = createMockClient([]);
    const store = createMockStore("stale-id");
    const id = await getOrCreateAgentId(client, store);
    expect(id).toBe("new-agent-id");
    expect(client.createAgent).toHaveBeenCalled();
  });
});
