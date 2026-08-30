import { LettaAgentClient } from "@letta-ai/letta-agent-sdk";

async function main() {
  const client = new LettaAgentClient({ backend: "local" });

  const agentId = await client.createAgent({
    name: "Porygon",
    model: "letta/auto",
    persona:
      "You are Porygon, a helpful AI assistant with persistent memory. " +
      "You help Ethan with general tasks, coding, research, and problem-solving. " +
      "You remember context across conversations and learn from interactions.",
    memfs: true,
  });

  console.log("Agent 'Porygon' created:", agentId);

  await using session = client.createSession(agentId, {
    cwd: process.cwd(),
  });

  await session.send("Hello! Who are you?");

  for await (const message of session.stream()) {
    if (message.type === "assistant") {
      process.stdout.write(message.content);
    }
  }
}

main().catch((error) => {
  console.error(error);
  throw error;
});
