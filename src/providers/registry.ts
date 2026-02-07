import type { ActionProvider } from "./types.js";

const providers = new Map<string, ActionProvider>();

export function registerProvider(provider: ActionProvider): void {
  providers.set(provider.name, provider);
  console.log(`[providers] Registered: ${provider.name} (${provider.type})`);
}

export function getProvider(name: string): ActionProvider {
  const p = providers.get(name);
  if (!p) {
    throw new Error(`Provider "${name}" not registered. Available: ${[...providers.keys()].join(", ")}`);
  }
  return p;
}

export function getProvidersByType(type: ActionProvider["type"]): ActionProvider[] {
  return [...providers.values()].filter((p) => p.type === type);
}

export function getAllProviders(): ActionProvider[] {
  return [...providers.values()];
}

export function hasProvider(name: string): boolean {
  return providers.has(name);
}
