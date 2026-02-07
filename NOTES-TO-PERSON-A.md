# Notes for Person A

## How to trigger Slack notifications from the pipeline

Everything is already wired. When you call `processMeeting()`, the post-process hook automatically:

1. Posts a formatted summary to the Slack channel (`SUMMARY_CHANNEL_ID`)
2. Creates Linear issues for action items with assignees (when Linear is configured)
3. Uses the pre-announce → create → notify pattern in the Slack thread

**You don't need to do anything extra.** Just call `processMeeting()` as you already do in `webhook.ts`:

```typescript
import { processMeeting } from "./pipeline/meetingPipeline.js";

await processMeeting({
  id: "some-meeting-id",
  title: "Sprint Planning",
  date: "2025-02-07",
  rawNotes: "the meeting notes...",
  transcript: "optional transcript...",
});
// → Slack summary + Linear issues happen automatically via hooks
```

## Testing it manually

```bash
curl -X POST http://localhost:3030/webhooks/granola \
  -H "Content-Type: application/json" \
  -d '{"id": "test-1", "title": "Test Meeting", "timestamp": "2025-02-07", "notes": "We decided to ship Monday. Alice will write the docs."}'
```

## What the Slack message looks like

```
📋 Meeting Summary: Sprint Planning
2025-02-07

The meeting focused on...

Key Decisions:
  • Use OAuth 2.0 with Google
  • JWT tokens with 7-day expiry

Action Items (3):
  • Create PRD for auth system → Alice
  • Research Redis libraries → Bob
  • Set up CI pipeline → Charlie
```

If Linear is configured, each assigned action item gets:
```
🔔 Creating issue: Create PRD for auth system → assigning to Alice
✅ Created: Create PRD for auth system (LIN-123) — assigned to Alice
```

## Hook architecture

The hook is registered in `src/index.ts`:
```typescript
registerPostProcessHook(slackPostProcessHook);
```

The hook implementation lives in `src/slack/postProcessHook.ts`. If you need to add more hooks (email, etc.), use the same pattern:
```typescript
registerPostProcessHook(myNewHook);
```
