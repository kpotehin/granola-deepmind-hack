import type { WebClient } from "@slack/web-api";
import OpenAI from "openai";
import { config } from "../config.js";
import { linearClient, fuzzyMatchUser } from "./client.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

interface ExtractedIssue {
  title: string;
  description: string;
  assigneeName: string | null;
}

async function extractIssueFields(text: string): Promise<ExtractedIssue> {
  const resp = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Extract a Linear issue from the user text. Return JSON:
{"title": "short issue title", "description": "detailed description", "assigneeName": "person name or null"}
Be concise. The title should be actionable (start with a verb).`,
      },
      { role: "user", content: text },
    ],
  });

  const raw = resp.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);
  return {
    title: parsed.title || "Untitled Issue",
    description: parsed.description || "",
    assigneeName: parsed.assigneeName || null,
  };
}

export interface CreateIssueResult {
  issueUrl: string;
  title: string;
  assigneeName: string | null;
}

export async function createIssueFromText(
  text: string,
  slackClient: WebClient,
  channel: string,
  threadTs: string
): Promise<CreateIssueResult> {
  // 1. Extract fields via GPT-4o
  const extracted = await extractIssueFields(text);

  // 2. Fuzzy match assignee
  const assignee = extracted.assigneeName
    ? fuzzyMatchUser(extracted.assigneeName)
    : null;

  const assigneeLabel = assignee?.name || extracted.assigneeName || "unassigned";

  // 3. Pre-announce in Slack thread
  await slackClient.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `🔔 Creating issue: *${extracted.title}* → assigning to ${assigneeLabel}`,
  });

  // 4. Create in Linear
  const issue = await linearClient.createIssue({
    teamId: config.linear.teamId,
    title: extracted.title,
    description: extracted.description,
    ...(assignee ? { assigneeId: assignee.id } : {}),
  });

  const createdIssue = await issue.issue;
  const issueUrl = createdIssue?.url || "(no url)";

  // 5. Notify with link
  await slackClient.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `✅ Created: <${issueUrl}|${extracted.title}> — assigned to ${assigneeLabel}`,
  });

  return {
    issueUrl,
    title: extracted.title,
    assigneeName: assigneeLabel,
  };
}
