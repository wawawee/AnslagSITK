import type { Grant } from '@/types';

function csvEscape(value: string): string {
  const v = (value || '').replace(/"/g, '""');
  return /[",\n\r]/.test(v) ? `"${v}"` : v;
}

export function downloadGrantsJson(grants: Grant[], filename: string): void {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), count: grants.length, grants }, null, 2)], {
    type: 'application/json',
  });
  triggerDownload(blob, filename.endsWith('.json') ? filename : `${filename}.json`);
}

export function downloadGrantsCsv(grants: Grant[], filename: string): void {
  const header = ['Namn', 'Finansiär', 'Deadline', 'Maxbelopp', 'Kategori', 'Status', 'URL', 'Beskrivning', 'Relevans'];
  const rows = grants.map(g => [
    g.name,
    g.funder || '',
    g.deadline || '',
    g.maxAmount || '',
    g.category || '',
    g.status || '',
    g.url || '',
    g.description || '',
    g.relevance || '',
  ].map(csvEscape).join(','));

  const bom = '\uFEFF';
  const csv = bom + [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export function parseGrantsImportFile(text: string): Grant[] {
  const data = JSON.parse(text) as { grants?: Grant[] } | Grant[];
  if (Array.isArray(data)) return data;
  if (data.grants && Array.isArray(data.grants)) return data.grants;
  throw new Error('Ogiltig fil — förväntar { grants: [...] } eller en array');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
