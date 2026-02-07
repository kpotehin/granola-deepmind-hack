import fs from "fs/promises";
import path from "path";
import type { MeetingRecord } from "../granola/types.js";

const MEETINGS_DIR = path.resolve("data/meetings");
const SEEN_FILE = path.resolve("data/seen-docs.json");

let seenIds: Set<string> = new Set();

export async function initMeetingStore(): Promise<void> {
  await fs.mkdir(MEETINGS_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(SEEN_FILE, "utf-8");
    seenIds = new Set(JSON.parse(raw));
  } catch {
    seenIds = new Set();
  }
}

export async function isProcessed(id: string): Promise<boolean> {
  return seenIds.has(id);
}

export async function markProcessed(id: string): Promise<void> {
  seenIds.add(id);
  await fs.writeFile(SEEN_FILE, JSON.stringify([...seenIds]), "utf-8");
}

export async function saveMeeting(record: MeetingRecord): Promise<void> {
  const filePath = path.join(MEETINGS_DIR, `${record.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");
  console.log(`[store] Saved meeting ${record.id}`);
}

export async function getMeetingRecord(id: string): Promise<MeetingRecord | null> {
  try {
    const filePath = path.join(MEETINGS_DIR, `${id}.json`);
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
