export interface AgentClient {
  createAgent(): Promise<string>;
  hasAgent(id: string): Promise<boolean>;
}

export interface AgentIdStore {
  get(): Promise<string | null>;
  set(id: string): Promise<void>;
}

/**
 * Resolve a stable agent id for Porygon, resuming an existing agent when the
 * saved id still exists on the client, otherwise creating a new agent and
 * persisting its id. Failures from either dependency (`store` or `client`) are
 * left to propagate to the caller.
 */
export async function getOrCreateAgentId(
  client: AgentClient,
  store: AgentIdStore,
): Promise<string> {
  const saved = await store.get();
  if (saved && (await client.hasAgent(saved))) {
    return saved;
  }
  const id = await client.createAgent();
  await store.set(id);
  return id;
}
