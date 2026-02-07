import { Router } from "express";
import { getMeeting, getTranscript } from "./mcpClient.js";
import { processMeeting } from "../pipeline/meetingPipeline.js";
import { isProcessed, markProcessed } from "../pipeline/meetingStore.js";

export const granolaWebhookRouter = Router();

granolaWebhookRouter.post("/granola", async (req, res) => {
  try {
    const { id, title, timestamp, notes, transcript: bodyTranscript } = req.body;

    if (!id) {
      res.status(400).json({ error: "Missing meeting id" });
      return;
    }

    if (await isProcessed(id)) {
      res.json({ status: "already_processed" });
      return;
    }

    console.log(`[webhook] New meeting: ${title || id}`);

    // Use notes from payload if provided, otherwise fetch via MCP
    let rawNotes = notes || "";
    let transcript = bodyTranscript || "";

    if (!rawNotes) {
      [rawNotes, transcript] = await Promise.all([
        getMeeting(id).catch(() => ""),
        getTranscript(id).catch(() => ""),
      ]);
    }

    await processMeeting({
      id,
      title: title || "Untitled Meeting",
      date: timestamp || new Date().toISOString(),
      rawNotes,
      transcript,
    });

    await markProcessed(id);

    res.json({ status: "processed", id });
  } catch (err) {
    console.error("[webhook] Error:", err);
    res.status(500).json({ error: "Processing failed" });
  }
});
