import { config } from "./config.js";
import { startServer } from "./server.js";
import { connectGranolaMCP } from "./granola/mcpClient.js";
import { initVectorStore } from "./knowledge/vectorStore.js";
import { initMeetingStore } from "./pipeline/meetingStore.js";
import { registerPostProcessHook } from "./pipeline/meetingPipeline.js";
import { startSlackApp } from "./slack/app.js";
import { registerMentionHandler } from "./slack/mentionHandler.js";
import { registerIngestCommand } from "./slack/ingestCommand.js";
import { slackPostProcessHook } from "./slack/postProcessHook.js";
import { registerProvider } from "./providers/registry.js";
import { LinearProvider } from "./providers/linear.js";
import { GitHubProvider } from "./providers/github.js";

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

  // Action providers (register all configured ones)
  if (config.linear.apiKey && config.linear.apiKey !== "lin_api_...") {
    try {
      const linear = new LinearProvider();
      await linear.init();
      registerProvider(linear);
    } catch (err) {
      console.warn("[boot] Linear provider failed:", err);
    }
  } else {
    console.log("[boot] Linear skipped (no API key)");
  }

  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) {
    try {
      const github = new GitHubProvider();
      await github.init();
      registerProvider(github);
    } catch (err) {
      console.warn("[boot] GitHub provider failed:", err);
    }
  } else {
    console.log("[boot] GitHub skipped (no GITHUB_TOKEN/GITHUB_REPO)");
  }

  // Slack bot
  registerMentionHandler();
  registerIngestCommand();
  registerPostProcessHook(slackPostProcessHook);
  await startSlackApp();
  console.log("[boot] Slack bot ready");

  console.log(`\n[boot] System ready on port ${config.port}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
