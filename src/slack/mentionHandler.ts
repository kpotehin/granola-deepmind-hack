import { slackApp } from "./app.js";
import { answerQuestion } from "../knowledge/qa.js";
import { summarizeThread } from "./threadSummarizer.js";
import { createIssueFromText } from "../linear/issueCreator.js";

export function registerMentionHandler(): void {
  slackApp.event("app_mention", async ({ event, client, say }) => {
    // Strip bot mention from text
    const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();
    const threadTs = event.thread_ts || event.ts;

    console.log(`[slack] Mention: "${text}" in ${event.channel}`);

    try {
      // Intent: summarize thread
      if (text.toLowerCase().includes("summarize") && event.thread_ts) {
        await client.reactions.add({
          channel: event.channel,
          timestamp: event.ts,
          name: "brain",
        });
        const summary = await summarizeThread(client, event.channel, event.thread_ts);
        await say({ text: summary, thread_ts: threadTs });
        return;
      }

      // Intent: create Linear issue
      if (
        text.toLowerCase().includes("create issue") ||
        text.toLowerCase().includes("make ticket") ||
        text.toLowerCase().includes("create ticket")
      ) {
        await client.reactions.add({
          channel: event.channel,
          timestamp: event.ts,
          name: "hammer_and_wrench",
        });
        await createIssueFromText(text, client, event.channel, threadTs);
        return;
      }

      // Default: Q&A
      await client.reactions.add({
        channel: event.channel,
        timestamp: event.ts,
        name: "mag",
      });
      const answer = await answerQuestion(text);
      await say({ text: answer, thread_ts: threadTs });
    } catch (err) {
      console.error("[slack] Mention handler error:", err);
      await say({
        text: `❌ Something went wrong: ${err instanceof Error ? err.message : "unknown error"}`,
        thread_ts: threadTs,
      });
    }
  });

  console.log("[slack] Mention handler registered");
}
