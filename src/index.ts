import { config } from "./config.js";
import { startServer } from "./server.js";
import { connectGranolaMCP } from "./granola/mcpClient.js";
import { initVectorStore } from "./knowledge/vectorStore.js";
import { initMeetingStore } from "./pipeline/meetingStore.js";

async function main() {
  console.log("=== Meeting Knowledge System ===\n");

  // Core infrastructure
  await initMeetingStore();
  console.log("[boot] Meeting store ready");

  await initVectorStore();
  console.log("[boot] Vector store ready");

  // Granola MCP — only connect if token is configured
  if (config.granola.oauthToken) {
    try {
      await connectGranolaMCP();
    } catch (err) {
      console.warn("[boot] Granola MCP connection failed (webhook still works):", err);
    }
  } else {
    console.log("[boot] Granola MCP skipped (no GRANOLA_OAUTH_TOKEN). Use /ingest or webhook.");
  }

  // Express server (webhooks + health)
  startServer();

  // Person B adds: Slack bot boot, Linear client init

  console.log(`\n[boot] System ready on port ${config.port}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
