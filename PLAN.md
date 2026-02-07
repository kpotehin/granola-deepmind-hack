# Meeting Knowledge System — Build Plan

> 1 day hackathon, 2 people, vibe coding.

## What We're Building

A system that ingests meeting notes from Granola AI, stores them in a searchable knowledge base, and lets anyone in the company chat with it via Slack. Also creates Linear issues and emails summaries to attendees.

**Key constraint**: No Granola Enterprise API key. We use a **hybrid Zapier + Granola MCP** approach:
- **Zapier webhook** triggers instantly when a new note is saved in a Granola folder → hits our Express endpoint
- **Granola MCP** (`https://mcp.granola.ai/mcp`) via `@modelcontextprotocol/sdk` fetches the full meeting content + transcript (richer data than Zapier payload)
- MCP uses browser OAuth (no Enterprise key needed). One-time auth, store token in `.env`
- Manual `/ingest` Slack command as additional input path

---

## Tech Stack

| Component | Choice | Install |
|---|---|---|
| Runtime | TypeScript + Node.js 20+ | `npx tsx src/index.ts` |
| Slack | `@slack/bolt` | Socket Mode (dev), HTTP (prod) |
| LLM | OpenAI `gpt-4o` + `text-embedding-3-small` | `openai` |
| Vector DB | `vectra` | Zero-infra, file-backed, in-process |
| Linear | `@linear/sdk` | GraphQL wrapper |
| Calendar | `googleapis` | Google Calendar v3 |
| Email | `nodemailer` | Gmail SMTP |
| Granola | `@modelcontextprotocol/sdk` | MCP client for Granola (no API key needed) |
| Server | Express | Health check + Slack HTTP mode |
| Deploy | Railway | One-command from git |

---

## Project Structure

```
src/
  index.ts                    # Entry: boots Slack app, Express server, poller
  config.ts                   # Env var loading + validation
  server.ts                   # Express app for webhook endpoints

  granola/
    mcpClient.ts              # MCP client for Granola (list/get meetings, transcripts)
    webhook.ts                # Express route: receives Zapier trigger, uses MCP to fetch full data
    types.ts                  # TypeScript types for Granola data

  knowledge/
    vectorStore.ts            # Vectra wrapper: init(), addDocument(), query()
    summarizer.ts             # GPT-4o: raw notes → structured summary
    qa.ts                     # RAG: question → vector search → GPT-4o answer

  slack/
    app.ts                    # Bolt app setup, event routing
    mentionHandler.ts         # @mention: routes to Q&A, summarize, or create-issue
    threadSummarizer.ts       # Fetches thread, summarizes, stores in KB
    ingestCommand.ts          # /ingest slash command for manual note input

  linear/
    client.ts                 # SDK init, cache teams/users on startup
    issueCreator.ts           # LLM extracts title+assignee → creates issue

  calendar/
    client.ts                 # Google Calendar OAuth wrapper
    attendeeLookup.ts         # Match meeting by time → get attendee emails

  email/
    sender.ts                 # Nodemailer Gmail SMTP
    templates.ts              # HTML email templates

  pipeline/
    meetingPipeline.ts        # Orchestrator: notes → summarize → store → email → notify
    meetingStore.ts            # Persists raw + summary data to data/meetings/{id}.json

data/
  vector-index/               # Vectra persistent storage (gitignored)
  meetings/                   # Raw meeting data archive (one JSON per meeting)
  seen-docs.json              # Tracks processed Granola doc IDs
```

---

## Data Flows

### Flow 1: Meeting Ingestion (2 input paths → 1 pipeline)

```
Path A: Zapier webhook (instant trigger when note saved)
        → POST /webhooks/granola (receives meeting ID/title)
        → Granola MCP fetches full content + transcript
        → meetingPipeline

Path B: Slack /ingest command → paste notes → meetingPipeline

meetingPipeline does:
  1. Fetch full data via MCP (raw notes, transcript, Granola summary)
  2. GPT-4o summarizer → structured summary
  3. Save all versions to data/meetings/{id}.json (raw + Granola summary + GPT summary)
  4. Vectra upsert (GPT summary for RAG search)
  5. Google Calendar → attendee emails → send summary email
  6. Post summary to Slack channel
  7. Extract action items → Linear issues (optional)
```

### Flow 2: Slack Q&A
```
@bot <question> → embed question → Vectra top-5 → GPT-4o with context → reply in thread
```

### Flow 3: Thread Summarization
```
@bot summarize this (in thread) → fetch all replies → GPT-4o → store in Vectra → reply
```

### Flow 4: Linear Issues
```
@bot create issue: <desc> assign @person → GPT-4o extracts fields → Linear API → reply with URL
```

---

## .env Template

```bash
# Granola MCP (one-time browser OAuth → paste token here)
GRANOLA_OAUTH_TOKEN=

# OpenAI
OPENAI_API_KEY=

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=

# Linear
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_ID=

# Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=

# Email
GMAIL_USER=
GMAIL_APP_PASSWORD=

# App
PORT=3000
POLLING_INTERVAL_MS=60000
SUMMARY_CHANNEL_ID=
```

---

# PERSON A — "Backend + Knowledge"

> Owns: Granola ingestion, Vectra knowledge base, summarization, meeting pipeline, Google Calendar, email
> **~6.5 hrs of work**

## Your files
```
src/config.ts
src/server.ts
src/granola/*          (mcpClient.ts, webhook.ts, types.ts)
src/knowledge/*        (vectorStore.ts, summarizer.ts)
src/calendar/*         (client.ts, attendeeLookup.ts)
src/email/*            (sender.ts, templates.ts)
src/pipeline/*         (meetingPipeline.ts, meetingStore.ts)
package.json, tsconfig.json, .env.example, .gitignore
```

## Morning tasks (Hours 1–4)

### A1. Project scaffolding (30 min)
- `npm init`, install all deps:
  ```
  npm i openai vectra @slack/bolt @linear/sdk googleapis nodemailer express dotenv tsx @modelcontextprotocol/sdk
  npm i -D typescript @types/node @types/express @types/nodemailer
  ```
- Create `tsconfig.json` (target ES2022, module NodeNext)
- Create `.gitignore` (node_modules, .env, data/, .claude/)
- Create `.env.example` with all vars listed above
- Create directory structure (`mkdir -p src/{granola,knowledge,slack,linear,calendar,email,pipeline}`)

### A2. Config loader (15 min)
- `src/config.ts` — load dotenv, export typed config object, throw on missing required vars
- Required: OPENAI_API_KEY, SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, GRANOLA_OAUTH_TOKEN
- Optional: GOOGLE_* vars, GMAIL_* vars

### A3. Granola MCP client + types (1 hr)
- `src/granola/types.ts` — interfaces for Meeting, Transcript, MeetingContent
- `src/granola/mcpClient.ts` — class GranolaMCP:
  - Uses `@modelcontextprotocol/sdk` with `StreamableHTTPClientTransport`
  - Connects to `https://mcp.granola.ai/mcp` with OAuth token from `.env`
  - `connect()` — init MCP client + transport
  - `listMeetings()` → calls `list_meetings` tool
  - `getMeeting(id)` → calls `get_meetings` tool → full notes + content
  - `getTranscript(id)` → calls `get_meeting_transcript` tool
  - `queryMeetings(query)` → calls `query_granola_meetings` tool

### A4. Zapier webhook + Express server (45 min)
- `src/server.ts` — Express app on PORT, health check at GET `/`
- `src/granola/webhook.ts` — POST `/webhooks/granola` route:
  - Receives Zapier trigger payload (meeting title, ID, timestamp)
  - Uses MCP client to fetch full content: `getMeeting(id)` + `getTranscript(id)`
  - Deduplicates via seen IDs in `data/seen-docs.json`
  - Passes rich data to meetingPipeline
- Zapier setup: Granola trigger "new note in folder" → Webhook action POST to our Railway URL

### A5. Vector store (45 min)
- `src/knowledge/vectorStore.ts`:
  - `init()` — create/load Vectra LocalDocumentIndex at `./data/vector-index/`
  - `addDocument(id: string, text: string, metadata?: Record<string, string>)` — upsert
  - `query(question: string, topK = 5)` → returns array of `{ text, score, metadata }`
  - Uses OpenAI `text-embedding-3-small` for embeddings

### A6. Summarizer (45 min)
- `src/knowledge/summarizer.ts`:
  - `summarizeMeeting(notes: string, transcript?: string)` → structured JSON:
    ```ts
    { summary: string, keyDecisions: string[], actionItems: { task: string, assignee?: string }[], discussionPoints: string[] }
    ```
  - GPT-4o with system prompt: "You are a meeting notes assistant. Extract structured information..."
  - Include both notes and transcript in context if available

## Afternoon tasks (Hours 5–8)

### A7. Meeting store + pipeline (45 min)
- `src/pipeline/meetingStore.ts`:
  - `saveMeeting(meeting: MeetingRecord)` — writes `data/meetings/{id}.json`
  - `getMeeting(id)` — reads back a stored meeting
  - `listMeetings()` — lists all stored meeting files
  - MeetingRecord type: `{ id, title, date, attendees, rawNotes, transcript, granolaSummary, gptSummary, createdAt }`
- `src/pipeline/meetingPipeline.ts`:
  - `processMeeting(rawNotes, transcript, granolaSummary, meetingTitle, meetingTime)`
  - Calls GPT-4o summarizer → saves all 3 versions via meetingStore → upserts GPT summary into Vectra → triggers email + Slack
  - Tracks processed doc IDs in `data/seen-docs.json`

### A8. Google Calendar (1 hr)
- `src/calendar/client.ts` — OAuth2 client using pre-generated refresh token from .env
- `src/calendar/attendeeLookup.ts`:
  - `getAttendees(meetingTime: Date, meetingTitle?: string)` → email[]
  - Search events in ±30 min window, match by title similarity if provided
  - Return attendee emails + display names

### A9. Email sender (45 min)
- `src/email/sender.ts` — Nodemailer transport with Gmail App Password
  - `sendSummaryEmail(to: string[], subject: string, summary: MeetingSummary)`
- `src/email/templates.ts` — clean HTML template with sections for summary, decisions, action items

### A10. Wire pipeline + index.ts (15 min)
- Boot Express server
- Init vectorStore
- Connect Granola MCP client
- Person B adds Slack + Linear boot here

---

## Sync points for Person A
| When | What | For Person B |
|---|---|---|
| Hour 2 | Push `vectorStore.ts` with `addDocument()` + `query()` interface | B needs for Q&A and thread summarizer |
| Hour 3 | Push `summarizer.ts` | B can test GPT-4o summarization via /ingest |
| Hour 5 | Push `meetingPipeline.ts` | B wires Linear issue creation into it |

---

# PERSON B — "Interfaces + Q&A + Deploy"

> Owns: Slack bot, RAG Q&A, Linear integration, thread summarization, deployment
> **~6.5 hrs of work**

## Your files
```
src/slack/*             (app.ts, mentionHandler.ts, threadSummarizer.ts, ingestCommand.ts)
src/knowledge/qa.ts     (RAG Q&A pipeline — you build it, you consume it)
src/linear/*            (client.ts, issueCreator.ts)
src/index.ts            (shared — wire Slack + Linear boot)
Dockerfile
```

## Pre-work (before coding starts, 15 min)
1. Go to https://api.slack.com/apps → Create New App
2. Enable **Socket Mode** (generates App-Level Token `xapp-...`)
3. Add Bot Token Scopes: `app_mentions:read`, `chat:write`, `channels:history`, `groups:history`, `commands`
4. Subscribe to Events: `app_mention`
5. Create Slash Command: `/ingest`
6. Install to workspace → copy Bot Token `xoxb-...`
7. Add all tokens to `.env`

## Morning tasks (Hours 1–4)

### B1. Slack Bolt app (30 min)
- `src/slack/app.ts`:
  - Initialize Bolt with Socket Mode (`@slack/bolt`)
  - Export `slackApp` instance
  - Register event handlers from mentionHandler, ingestCommand
  - Start app

### B2. Mention handler + intent routing (1 hr)
- `src/slack/mentionHandler.ts`:
  - Listen to `app_mention` events
  - Strip bot mention from text, detect intent:
    - Text contains "summarize" + has `thread_ts` → call threadSummarizer
    - Text contains "create issue" / "make ticket" → call issueCreator
    - Otherwise → call qa.answerQuestion()
  - Always reply in thread (`thread_ts`)
  - Show typing indicator while processing

### B3. Thread summarizer (1 hr)
- `src/slack/threadSummarizer.ts`:
  - `summarizeThread(channel: string, threadTs: string)`
  - Fetch all replies: `client.conversations.replies({ channel, ts: threadTs })`
  - Format messages: `"[username] (time): message text"`
  - Call GPT-4o to summarize the thread
  - Store summary in vectorStore (import from Person A)
  - Reply in thread with the summary

### B4. Ingest command (30 min)
- `src/slack/ingestCommand.ts`:
  - Register `/ingest` slash command
  - Open a modal (Slack Block Kit) with a text area for pasting notes
  - On submit → pass notes to meetingPipeline (import from Person A)
  - Confirm in Slack: "Notes ingested and summarized!"

### B5. RAG Q&A pipeline (45 min)
- `src/knowledge/qa.ts`:
  - `answerQuestion(question: string)` → string
  - Query vectorStore for top-5 chunks (import from Person A)
  - Build prompt: "Answer using ONLY the provided meeting context. Cite which meeting the info came from. If not found, say so."
  - Call GPT-4o, return response
  - Wire into mentionHandler as default intent

## Afternoon tasks (Hours 5–8)

### B6. Linear client (30 min)
- `src/linear/client.ts`:
  - Init `LinearClient` with API key
  - On startup: fetch and cache all team members (id, name, email)
  - Export `getTeams()`, `getUsers()`, `linearClient`

### B7. Issue creator (1 hr)
- `src/linear/issueCreator.ts`:
  - `createIssueFromText(text: string)` → `{ issueUrl, title, assignee }`
  - Use GPT-4o function calling to extract: `{ title, description, assigneeName }`
  - Fuzzy match `assigneeName` against cached Linear users (case-insensitive includes)
  - Call `linearClient.createIssue({ teamId, title, description, assigneeId })`
  - Return issue URL + details

### B8. Wire Linear into Slack + pipeline (45 min)
- In mentionHandler: when "create issue" intent detected:
  - Call `createIssueFromText()` with the message text
  - Reply with: "Created issue: [title](url) — assigned to [name]"
- In meetingPipeline (Person A's code): after summarization:
  - If actionItems exist, auto-create Linear issues for items with clear assignees
  - Post issue links to Slack summary thread

### B9. Dockerfile + Railway deploy (30 min)
- Multi-stage Dockerfile (build + runtime)
- Railway config: persistent volume for `./data/`
- Set env vars in Railway dashboard

### B10. End-to-end testing (remaining time)
- Test full flow: `/ingest` → summary → Q&A → create issue
- Test thread summarization
- Test Zapier webhook → MCP fetch → pipeline
- Fix edge cases, polish responses

---

## Sync points for Person B
| When | What | From Person A |
|---|---|---|
| Hour 2 | Import `vectorStore.addDocument()` + `query()` | For Q&A and thread summarizer |
| Hour 3 | Import `summarizer.ts` | For /ingest testing |
| Hour 5 | Import `meetingPipeline.ts` | Wire Linear issue creation into it |

---

# Timeline

```
Hour 1-2   [PARALLEL]  A: scaffolding + config + Granola MCP    B: Slack pre-work + Bolt app + mention handler
                        ── sync: A pushes vectorStore interface ──
Hour 2-4   [PARALLEL]  A: webhook + Vectra + summarizer         B: thread summarizer + ingest command + RAG Q&A
                        ── sync: A pushes summarizer + pipeline ──
Hour 4-6   [PARALLEL]  A: meeting store + pipeline + Calendar   B: Linear client + issue creator + wire into Slack
Hour 6-7   [PARALLEL]  A: email sender + wire index.ts          B: wire Linear into pipeline + Dockerfile + Railway
Hour 7-8   [TOGETHER]  Deploy to Railway, end-to-end testing, demo rehearsal
```

---

# MVP vs Cut List

### Must ship (core demo)
1. Meeting notes ingestion (Zapier trigger → MCP fetch, + /ingest fallback)
2. GPT-4o summarization
3. Vectra knowledge base + RAG Q&A
4. Slack bot @mention Q&A
5. Linear issue creation from Slack

### Nice-to-have
6. Thread summarization → KB
7. Email to attendees (Google Calendar)
8. Auto action-item → Linear issues
9. Use Granola MCP `query_granola_meetings` for direct search (bypass our own RAG)

### Cut first if behind
- **Email/Calendar** — most complex auth setup
- **Thread summarization** — self-contained, add last
- **Auto action items** — manual "create issue" is enough for demo

### Minimum demo (5 steps)
1. Finish a meeting in Granola → Zapier fires → system fetches full notes via MCP
2. Bot posts summary to Slack channel
3. "@bot what decisions were made?" → RAG answer
4. "@bot create issue: implement auth flow, assign to Alice" → Linear link
5. (bonus) Show email sent to attendees

---

# Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Granola input | Zapier trigger → MCP fetch | Zapier fires instantly on new note. MCP pulls full content + transcript. No Enterprise API key needed. |
| Vector DB | Vectra (not ChromaDB) | In-process, no Docker needed. |
| Slack mode | Socket Mode (dev) → HTTP (prod) | No ngrok for dev. Switch for Railway. |
| LLM | GPT-4o everywhere | Single API key for chat + embeddings. |
| Embeddings | text-embedding-3-small | Cheap, fast, 1536-dim. |
| Deploy | Railway | One-command deploy, persistent volumes. |
| Calendar auth | Pre-generated refresh token | Skip building OAuth consent flow. |
| Email | Gmail App Password + Nodemailer | No external email service needed. |
