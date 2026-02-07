import OpenAI from "openai";
import { config } from "../config.js";
import { query } from "./vectorStore.js";

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export async function answerQuestion(question: string): Promise<string> {
  const results = await query(question, 5);

  if (results.length === 0) {
    return "I don't have any meeting notes that match your question yet. Try ingesting some meetings first with `/ingest`.";
  }

  const context = results
    .map((r, i) => `[Source ${i + 1} (score: ${r.score.toFixed(2)})]\n${r.text}`)
    .join("\n\n---\n\n");

  const resp = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a meeting knowledge assistant. Answer questions using ONLY the provided meeting context below.
- Cite which meeting the information came from when possible.
- If the answer is not in the context, say "I couldn't find that in the meeting notes."
- Be concise and direct.

## Meeting Context
${context}`,
      },
      { role: "user", content: question },
    ],
  });

  return resp.choices[0]?.message?.content || "Sorry, I couldn't generate an answer.";
}
