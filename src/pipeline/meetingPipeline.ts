import { summarizeMeeting } from "../knowledge/summarizer.js";
import { addDocument } from "../knowledge/vectorStore.js";
import { saveMeeting } from "./meetingStore.js";
import type { MeetingRecord, MeetingSummary } from "../granola/types.js";

interface MeetingInput {
  id: string;
  title: string;
  date: string;
  rawNotes: string;
  transcript: string;
  participants?: string[];
  granolaSummary?: string;
}

// Hook for Person B to wire Slack + Linear notifications
export type PostProcessHook = (
  record: MeetingRecord,
  summary: MeetingSummary
) => Promise<void>;

const hooks: PostProcessHook[] = [];

export function registerPostProcessHook(hook: PostProcessHook): void {
  hooks.push(hook);
}

export async function processMeeting(input: MeetingInput): Promise<MeetingRecord> {
  console.log(`[pipeline] Processing: ${input.title}`);

  // 1. Summarize with GPT-4o
  const gptSummary = await summarizeMeeting(input.rawNotes, input.transcript);
  console.log(`[pipeline] Summary: ${gptSummary.summary.slice(0, 100)}...`);

  // 2. Build record with all versions
  const record: MeetingRecord = {
    id: input.id,
    title: input.title,
    date: input.date,
    participants: input.participants || [],
    rawNotes: input.rawNotes,
    transcript: input.transcript,
    granolaSummary: input.granolaSummary || "",
    gptSummary,
    createdAt: new Date().toISOString(),
  };

  // 3. Persist raw + summaries to JSON
  await saveMeeting(record);

  // 4. Upsert GPT summary into Vectra for RAG
  const vectorText = [
    `Meeting: ${input.title} (${input.date})`,
    gptSummary.summary,
    "Key Decisions: " + gptSummary.keyDecisions.join("; "),
    "Action Items: " + gptSummary.actionItems.map((a) => `${a.task}${a.assignee ? ` (${a.assignee})` : ""}`).join("; "),
    "Discussion: " + gptSummary.discussionPoints.join("; "),
  ].join("\n");

  await addDocument(input.id, vectorText, {
    title: input.title,
    date: input.date,
  });

  console.log(`[pipeline] Stored in Vectra: ${input.id}`);

  // 5. Run post-process hooks (Slack notification, Linear issues — wired by Person B)
  for (const hook of hooks) {
    try {
      await hook(record, gptSummary);
    } catch (err) {
      console.error("[pipeline] Hook error:", err);
    }
  }

  return record;
}
