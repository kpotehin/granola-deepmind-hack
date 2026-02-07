# Agents Quick Reference

> Everything you need to know to work on this codebase. Read this first.

## What This Is

A meeting knowledge system: ingests notes from Granola AI, stores in a searchable vector DB, exposes via Slack bot for Q&A, and creates Linear issues automatically.

## Status

### Done (Person A — Backend + Knowledge)
- [x] Project scaffolding, config, env loading
- [x] Granola MCP client (`@modelcontextprotocol/sdk`)
- [x] Express server on port 3030 + webhook endpoint
- [x] Vectra vector store (file-backed, zero infra)
- [x] GPT-4o summarizer (structured JSON output)
- [x] Meeting store (JSON file persistence + dedup)
- [x] Pipeline orchestrator with `registerPostProcessHook()`
- [x] End-to-end tested: webhook → GPT-4o summarize → JSON persist → Vectra store

### TODO (Person B — Interfaces + Q&A + Deploy)
- [ ] B1. Slack Bolt app (`src/slack/app.ts`) — Socket Mode
- [ ] B2. Mention handler — intent routing: Q&A / summarize / create-issue
- [ ] B3. RAG Q&A (`src/knowledge/qa.ts`) — Vectra search → GPT-4o answer
- [ ] B4. Thread summarizer — fetch thread → summarize → store
- [ ] B5. Ingest command (`/ingest` slash command)
- [ ] B6. Linear client + issue creator with pre-announce → execute → notify
- [ ] B7. Wire Slack + Linear into pipeline, Dockerfile, Railway deploy

---

## Architecture

```
Zapier webhook (or /ingest)
  → POST /webhooks/granola {id, title, timestamp, notes}
  → meetingPipeline:
      1. GPT-4o summarizer → {summary, keyDecisions, actionItems, discussionPoints}
      2. Save to data/meetings/{id}.json (raw + GPT summary)
      3. Upsert into Vectra (for RAG search)
      4. Run post-process hooks (Person B wires Slack + Linear here)

Slack @bot <question>
  → RAG: embed question → Vectra top-5 → GPT-4o with context → reply in thread

Slack @bot create issue: <desc> assign @person
  → Pre-announce in thread → GPT-4o extract fields → Linear API → notify with link
```

---

## File Map

```
src/
  index.ts                  # Entry point — boots everything
  config.ts                 # Env vars (dotenv), typed config object
  server.ts                 # Express on port 3030, health GET /, mounts /webhooks

  granola/
    types.ts                # All shared interfaces (MeetingRecord, MeetingSummary, ActionItem, etc.)
    mcpClient.ts            # Granola MCP client (optional, needs GRANOLA_OAUTH_TOKEN)
    webhook.ts              # POST /webhooks/granola — accepts {id, title, timestamp, notes?, transcript?}

  knowledge/
    vectorStore.ts          # Vectra: initVectorStore(), addDocument(id, text, meta), query(question, topK)
    summarizer.ts           # GPT-4o: summarizeMeeting(notes, transcript?) → MeetingSummary
    qa.ts                   # [TODO] RAG: answerQuestion(question) → string

  slack/                    # [TODO] All Slack files
    app.ts                  # Bolt + Socket Mode setup
    mentionHandler.ts       # @mention intent routing
    threadSummarizer.ts     # Thread → summarize → Vectra
    ingestCommand.ts        # /ingest slash command

  linear/                   # [TODO] All Linear files
    client.ts               # SDK init, cache team members
    issueCreator.ts         # Pre-announce → create → notify

  pipeline/
    meetingPipeline.ts      # Orchestrator: summarize → save → Vectra → hooks
    meetingStore.ts          # JSON persistence + dedup (seen-docs.json)

data/                       # Gitignored runtime data
  vector-index/             # Vectra persistent storage
  meetings/                 # {id}.json files (raw + summaries)
  seen-docs.json            # Set of processed meeting IDs
```

---

## Key Interfaces (src/granola/types.ts)

```typescript
interface MeetingRecord {
  id: string;
  title: string;
  date: string;
  participants: string[];
  rawNotes: string;
  transcript: string;
  granolaSummary: string;
  gptSummary: MeetingSummary;
  createdAt: string;
}

interface MeetingSummary {
  summary: string;
  keyDecisions: string[];
  actionItems: ActionItem[];
  discussionPoints: string[];
}

interface ActionItem {
  task: string;
  assignee?: string;
}
```

---

## Key Integration Points for Person B

### 1. Post-Process Hook (wire Slack + Linear into pipeline)

In `src/pipeline/meetingPipeline.ts`:

```typescript
import { registerPostProcessHook, PostProcessHook } from "../pipeline/meetingPipeline.js";

// Called after every meeting is processed
registerPostProcessHook(async (record: MeetingRecord, summary: MeetingSummary) => {
  // Post summary to Slack channel
  // For each action item with assignee → pre-announce → create Linear issue → notify
});
```

### 2. Vector Store Query (for RAG Q&A)

```typescript
import { query, QueryResult } from "../knowledge/vectorStore.js";

const results: QueryResult[] = await query("what decisions were made?", 5);
// results[].text — matched content
// results[].score — relevance score
```

### 3. Boot Sequence (add to src/index.ts)

Person B adds Slack + Linear initialization in `src/index.ts` after the existing boot steps:
```typescript
// Person B adds: Slack bot boot, Linear client init
```

---

## Running Locally

```bash
npm run dev          # tsx watch src/index.ts (hot reload)
npm start            # tsx src/index.ts

# Test webhook
curl -X POST http://localhost:3030/webhooks/granola \
  -H "Content-Type: application/json" \
  -d '{"id":"test-001","title":"Test Meeting","notes":"Alice said we should ship by Friday. Bob will fix the auth bug."}'

# Health check
curl http://localhost:3030/
```

---

## Env Vars (.env)

```bash
# Required
OPENAI_API_KEY=sk-...
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
LINEAR_API_KEY=lin_api_...

# Optional
GRANOLA_OAUTH_TOKEN=            # MCP auth (can skip, use webhook instead)
SLACK_APP_TOKEN=xapp-...        # Socket Mode (dev only)
LINEAR_TEAM_ID=                 # Default team for issues
SUMMARY_CHANNEL_ID=             # Slack channel for auto-posting
PORT=3030                       # Default 3030
```

---

## Tech Stack

| Component | Package | Version |
|---|---|---|
| Runtime | TypeScript + tsx | Node 20+ |
| LLM | `openai` (GPT-4o) | ^5.1.0 |
| Embeddings | `openai` (text-embedding-3-small) | ^5.1.0 |
| Vector DB | `vectra` (LocalDocumentIndex) | ^0.9.0 |
| Slack | `@slack/bolt` | ^4.3.0 |
| Linear | `@linear/sdk` | ^29.0.0 |
| Granola MCP | `@modelcontextprotocol/sdk` | ^1.12.1 |
| HTTP | `express` v5 | ^5.1.0 |

---

## Gotchas

- **Vectra API**: Use `isCatalogCreated()` not `isIndexCreated()`. Use `getDocumentId(id)` not `getDocument(id)`. `LocalDocumentResult` has no `.metadata` property.
- **Granola MCP**: Requires browser OAuth managed by tools. No way to get raw token for .env. App works fine without it — use webhook with inline `notes` field instead.
- **Webhook accepts inline notes**: Send `{id, title, notes}` directly. Only falls back to MCP fetch when `notes` is empty.
- **Config**: `OPENAI_API_KEY`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `LINEAR_API_KEY` are required at boot (will throw if missing).
- **Express 5**: Using v5 — slightly different from v4 (async error handling built-in).

---

## Demo Script

1. Paste meeting notes via `/ingest` in Slack (or trigger webhook)
2. Bot posts summary to channel with key decisions + action items
3. Bot pre-announces "Creating issue: X for Y" → Linear issue link in thread
4. "@bot what decisions were made?" → RAG answer from knowledge base
5. "@bot create issue: build auth flow, assign to Alice" → pre-announce → Linear link
