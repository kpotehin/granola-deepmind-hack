import { LinearClient } from "@linear/sdk";
import { config } from "../config.js";

export let linearClient: LinearClient;

interface LinearUser {
  id: string;
  name: string;
  email: string;
}

let cachedUsers: LinearUser[] = [];

export async function initLinearClient(): Promise<void> {
  linearClient = new LinearClient({ apiKey: config.linear.apiKey });

  // Cache team members for fuzzy matching
  try {
    const users = await linearClient.users();
    cachedUsers = users.nodes.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email || "",
    }));
    console.log(`[linear] Cached ${cachedUsers.length} users`);
  } catch (err) {
    console.warn("[linear] Could not cache users:", err);
  }

  console.log("[linear] Client ready");
}

export function getUsers(): LinearUser[] {
  return cachedUsers;
}

export function fuzzyMatchUser(name: string): LinearUser | null {
  if (!name) return null;
  const lower = name.toLowerCase().trim();

  // Exact match
  const exact = cachedUsers.find(
    (u) => u.name.toLowerCase() === lower || u.email.toLowerCase().split("@")[0] === lower
  );
  if (exact) return exact;

  // Partial (first name)
  const partial = cachedUsers.find(
    (u) => u.name.toLowerCase().startsWith(lower) || u.name.toLowerCase().includes(lower)
  );
  if (partial) return partial;

  return null;
}
