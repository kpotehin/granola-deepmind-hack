import { LocalDocumentIndex } from "vectra";
import OpenAI from "openai";
import { config } from "../config.js";
import path from "path";

let index: LocalDocumentIndex | null = null;
let openai: OpenAI;

export async function initVectorStore(): Promise<void> {
  openai = new OpenAI({ apiKey: config.openai.apiKey });

  index = new LocalDocumentIndex({
    folderPath: path.resolve("data/vector-index"),
    embeddings: {
      createEmbeddings: async (inputs: string[]) => {
        const resp = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: inputs,
        });
        return {
          status: "success" as const,
          output: resp.data.map((d) => d.embedding),
        };
      },
      maxTokens: 8000,
    },
  });

  if (!(await index.isCatalogCreated())) {
    await index.createIndex();
    console.log("[vectra] Created new index");
  }

  console.log("[vectra] Vector store initialized");
}

function getIndex(): LocalDocumentIndex {
  if (!index) throw new Error("Vector store not initialized");
  return index;
}

export async function addDocument(
  id: string,
  text: string,
  metadata: Record<string, string> = {}
): Promise<void> {
  const idx = getIndex();

  // Delete existing doc if present (upsert)
  const existingId = await idx.getDocumentId(id);
  if (existingId) {
    await idx.deleteDocument(id);
  }

  await idx.upsertDocument(id, text, undefined, metadata);
}

export interface QueryResult {
  text: string;
  score: number;
  metadata: Record<string, any>;
}

export async function query(
  question: string,
  topK = 5
): Promise<QueryResult[]> {
  const idx = getIndex();
  const results = await idx.queryDocuments(question, { maxDocuments: topK });

  const output: QueryResult[] = [];
  for (const r of results) {
    const sections = await r.renderSections(500, 1);
    output.push({
      text: sections.map((s: any) => s.text).join("\n"),
      score: r.score,
      metadata: {},
    });
  }
  return output;
}
