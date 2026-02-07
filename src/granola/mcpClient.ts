import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from "../config.js";
import type { GranolaMeeting } from "./types.js";

let client: Client | null = null;

export async function connectGranolaMCP(): Promise<void> {
  const transport = new StreamableHTTPClientTransport(
    new URL(config.granola.mcpUrl),
    {
      requestInit: {
        headers: {
          Authorization: `Bearer ${config.granola.oauthToken}`,
        },
      },
    }
  );

  client = new Client({ name: "meeting-knowledge-system", version: "1.0.0" });
  await client.connect(transport);
  console.log("[granola] MCP client connected");
}

function getClient(): Client {
  if (!client) throw new Error("Granola MCP not connected. Call connectGranolaMCP() first.");
  return client;
}

export async function listMeetings(): Promise<GranolaMeeting[]> {
  const result = await getClient().callTool({
    name: "list_meetings",
    arguments: {},
  });
  return parseMCPResult(result);
}

export async function getMeeting(id: string): Promise<string> {
  const result = await getClient().callTool({
    name: "get_meetings",
    arguments: { id },
  });
  return extractText(result);
}

export async function getTranscript(id: string): Promise<string> {
  const result = await getClient().callTool({
    name: "get_meeting_transcript",
    arguments: { id },
  });
  return extractText(result);
}

export async function queryMeetings(query: string): Promise<string> {
  const result = await getClient().callTool({
    name: "query_granola_meetings",
    arguments: { query },
  });
  return extractText(result);
}

function extractText(result: any): string {
  if (result?.content && Array.isArray(result.content)) {
    return result.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
  }
  return JSON.stringify(result);
}

function parseMCPResult(result: any): any {
  const text = extractText(result);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
