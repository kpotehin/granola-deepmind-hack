import type { MeetingRecord, MeetingSummary } from "../granola/types.js";
import { slackApp } from "./app.js";
import { config } from "../config.js";
import { createIssueFromText } from "../linear/issueCreator.js";
import { linearClient } from "../linear/client.js";

export async function slackPostProcessHook(
  record: MeetingRecord,
  summary: MeetingSummary
): Promise<void> {
  const channelId = config.slack.summaryChannelId;
  if (!channelId) {
    console.warn("[hook] No SUMMARY_CHANNEL_ID set, skipping Slack notification");
    return;
  }

  // Format the summary message
  const actionList = summary.actionItems.length > 0
    ? summary.actionItems
        .map((a) => `  • ${a.task}${a.assignee ? ` → *${a.assignee}*` : ""}`)
        .join("\n")
    : "  _None identified_";

  const decisionList = summary.keyDecisions.length > 0
    ? summary.keyDecisions.map((d) => `  • ${d}`).join("\n")
    : "  _None_";

  const text = [
    `📋 *Meeting Summary: ${record.title}*`,
    `_${record.date}_\n`,
    summary.summary,
    `\n*Key Decisions:*`,
    decisionList,
    `\n*Action Items (${summary.actionItems.length}):*`,
    actionList,
  ].join("\n");

  // Post summary to channel
  const result = await slackApp.client.chat.postMessage({
    channel: channelId,
    text,
    unfurl_links: false,
  });

  const threadTs = result.ts;
  if (!threadTs) return;

  // Auto-create Linear issues for action items with assignees (skip if Linear not configured)
  if (!linearClient) {
    console.log("[hook] Linear not configured, skipping issue creation");
    return;
  }
  const assignedItems = summary.actionItems.filter((a) => a.assignee);
  if (assignedItems.length === 0) return;

  for (const item of assignedItems) {
    try {
      await createIssueFromText(
        `${item.task}, assign to ${item.assignee}`,
        slackApp.client,
        channelId,
        threadTs
      );
    } catch (err) {
      console.error(`[hook] Failed to create issue for "${item.task}":`, err);
      await slackApp.client.chat.postMessage({
        channel: channelId,
        thread_ts: threadTs,
        text: `❌ Failed to create issue: *${item.task}* — ${err instanceof Error ? err.message : "unknown error"}`,
      });
    }
  }
}
