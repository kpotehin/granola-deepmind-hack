import type { WebClient } from "@slack/web-api";
import OpenAI from "openai";
import { config } from "../config.js";
import { addDocument } from "../knowledge/vectorStore.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export async function summarizeThread(
  client: WebClient,
  channel: string,
  threadTs: string
): Promise<string> {
  const replies = await client.conversations.replies({
    channel,
    ts: threadTs,
    limit: 200,
  });

  if (!replies.messages || replies.messages.length < 2) {
    return "Not enough messages in this thread to summarize.";
  }

  const formatted = replies.messages
    .map((m) => {
      const user = m.user || "unknown";
      const time = m.ts
        ? new Date(parseFloat(m.ts) * 1000).toLocaleTimeString()
        : "";
      return `[${user}] (${time}): ${m.text}`;
    })
    .join("\n");

  const resp = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `Summarize this Slack thread concisely. Highlight key points, decisions, and any action items.`,
      },
      { role: "user", content: formatted },
    ],
  });

  const summary = resp.choices[0]?.message?.content || "Could not summarize.";

  // Store in knowledge base
  const docId = `thread-${channel}-${threadTs}`;
  await addDocument(docId, `Slack Thread Summary:\n${summary}`, {
    type: "thread-summary",
    channel,
  });

  return summary;
}
