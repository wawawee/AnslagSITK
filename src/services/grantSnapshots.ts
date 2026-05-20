import type { Grant } from '@/types';

export interface GrantSnapshot {
  id: string;
  label: string;
  orgName: string;
  createdAt: string;
  grants: Grant[];
}

const SNAPSHOTS_KEY = 'sitk-grant-snapshots';

export function listGrantSnapshots(): GrantSnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    const list: GrantSnapshot[] = raw ? JSON.parse(raw) : [];
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export function saveGrantSnapshot(label: string, grants: Grant[], orgName = ''): GrantSnapshot {
  const snapshot: GrantSnapshot = {
    id: `snap-${Date.now()}`,
    label: label.trim() || `Lista ${new Date().toLocaleString('sv-SE')}`,
    orgName,
    createdAt: new Date().toISOString(),
    grants,
  };
  const list = listGrantSnapshots().filter(s => s.id !== snapshot.id);
  list.unshift(snapshot);
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(list));
  return snapshot;
}

export function loadGrantSnapshot(id: string): GrantSnapshot | null {
  return listGrantSnapshots().find(s => s.id === id) ?? null;
}

export function deleteGrantSnapshot(id: string): void {
  const list = listGrantSnapshots().filter(s => s.id !== id);
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(list));
}
