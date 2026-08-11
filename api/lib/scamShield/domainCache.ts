/**
 * In-memory blocked-domain cache (V93-P1). Holds the Set the detector hook
 * consults via isDomainBlocked() — the send path NEVER hits the DB or the
 * network for this; the Scam Shield agent refreshes it on its 6h interval.
 * Defaults to empty (fail-open: nothing is blocked until the first refresh).
 */
import { blockedDomains } from "@db/schema";
import { getDb } from "../../queries/connection";

const cache = new Set<string>();

function normalize(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "");
}

/** Pure, synchronous, in-memory — safe for the chat.send hot path. */
export function isDomainBlocked(domain: string): boolean {
  const d = normalize(domain);
  if (d === "") return false;
  if (cache.has(d)) return true;
  // Parent-domain match: a.blocked-example.com is blocked if blocked-example.com is.
  const labels = d.split(".");
  for (let i = 1; i < labels.length - 1; i++) {
    if (cache.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

export function setBlockedDomains(domains: Iterable<string>): void {
  cache.clear();
  for (const domain of domains) {
    const d = normalize(domain);
    if (d !== "") cache.add(d);
  }
}

export function blockedDomainCount(): number {
  return cache.size;
}

/** Reload the Set from the blocked_domains table. Called by the agent only. */
export async function refreshBlockedDomains(): Promise<number> {
  const rows = await getDb()
    .select({ domain: blockedDomains.domain })
    .from(blockedDomains);
  setBlockedDomains(rows.map((r) => r.domain));
  return cache.size;
}
