import type { Grant } from '@/types';

function grantKey(g: Grant): string {
  if (g.url) {
    try {
      const u = new URL(g.url);
      return `url:${u.hostname}${u.pathname}`.toLowerCase().replace(/\/$/, '');
    } catch {
      /* fall through */
    }
  }
  return `name:${(g.name || '').trim().toLowerCase()}|${(g.funder || '').trim().toLowerCase()}`;
}

/** Lägg till nya utlysningar utan dubbletter (URL eller namn+finansiär). */
export function mergeGrants(
  existing: Grant[],
  incoming: Grant[]
): { merged: Grant[]; added: number; skipped: number } {
  const seen = new Set(existing.map(grantKey));
  const newOnes: Grant[] = [];
  let skipped = 0;

  for (const g of incoming) {
    const k = grantKey(g);
    if (seen.has(k)) {
      skipped++;
      continue;
    }
    seen.add(k);
    newOnes.push({
      ...g,
      id: g.id?.startsWith('grant-') ? `${g.id}-${newOnes.length}` : `grant-${Date.now()}-${newOnes.length}`,
    });
  }

  return { merged: [...existing, ...newOnes], added: newOnes.length, skipped };
}
