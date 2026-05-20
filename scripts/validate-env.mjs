#!/usr/bin/env node
/**
 * Validerar .env för AnslagSITK: OpenRouter-nycklar, Exa, Qdrant.
 * Kör: npm run validate
 */
import 'dotenv/config';

const OR_KEYS = [
  ['OPENROUTER_API_KEY', 'shared (Vercel)'],
  ['OPENROUTER_KEY_PELLEGROSSO', 'pellegrosso'],
  ['OPENROUTER_KEY_CYMWAVE', 'cymwave'],
  ['OPENROUTER_KEY_CARL', 'carl'],
  ['OPENROUTER_KEY_HLIVFA', 'hlivfa'],
  ['OPENROUTER_KEY_PERBRINELL', 'perbrinell'],
  ['OPENROUTER_KEY_LEADAGENTICOS', 'leadagenticos'],
  ['OPENROUTER_KEY_PERBRINELL_MAP', 'perbrinell-map'],
];

async function testOpenRouter(name, key) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://sitk.se',
      'X-OpenRouter-Title': 'AnslagSITK-validate',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5,
    }),
  });
  if (res.ok) return { ok: true };
  const body = await res.text();
  return { ok: false, status: res.status, body: body.slice(0, 160) };
}

async function testExa(key) {
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({ query: 'test', numResults: 1 }),
  });
  return { ok: res.ok, status: res.status };
}

async function testQdrant(url, apiKey) {
  const { QdrantClient } = await import('@qdrant/js-client-rest');
  const client = new QdrantClient({ url, apiKey });
  await client.getCollections();
  return { ok: true };
}

let failed = 0;

console.log('\n=== AnslagSITK — miljövalidering ===\n');

console.log('OpenRouter-nycklar:');
for (const [envName, label] of OR_KEYS) {
  const key = process.env[envName]?.trim();
  if (!key) {
    console.log(`  ○ ${label}: saknas`);
    continue;
  }
  try {
    const r = await testOpenRouter(label, key);
    if (r.ok) console.log(`  ✓ ${label}: OK`);
    else {
      console.log(`  ✗ ${label}: HTTP ${r.status} — ${r.body}`);
      failed++;
    }
  } catch (e) {
    console.log(`  ✗ ${label}: ${e.message}`);
    failed++;
  }
}

const officialKeys = [
  ['GDP_API_KEY_VINNOVA', 'GDP Vinnova'],
  ['GDP_API_KEY_FORMAS', 'GDP Formas'],
  ['GDP_API_KEY_FORTE', 'GDP Forte'],
  ['GDP_API_KEY_VR', 'GDP VR'],
  ['SWECRIS_API_KEY', 'Swecris'],
];
console.log('\nOfficiella register:');
for (const [envName, label] of officialKeys) {
  const key = process.env[envName]?.trim();
  console.log(key ? `  ✓ ${label}: satt` : `  ○ ${label}: saknas`);
}

const exa = process.env.EXA_API_KEY?.trim();
if (!exa) {
  console.log('\nExa: ○ saknas (sökning använder LLM-fallback)');
} else {
  try {
    const r = await testExa(exa);
    console.log(r.ok ? '\nExa: ✓ OK' : `\nExa: ✗ HTTP ${r.status}`);
    if (!r.ok) failed++;
  } catch (e) {
    console.log(`\nExa: ✗ ${e.message}`);
    failed++;
  }
}

const qUrl = (process.env.QDRANT_URL || process.env.QDRANT_ENDPOINT || '').trim();
const qKey = process.env.QDRANT_API_KEY?.trim();
const orKey = process.env.OPENROUTER_API_KEY?.trim();
if (!qUrl || !qKey) {
  console.log('\nQdrant: ○ saknas (vektorminne inaktivt — OK för grundfunktioner)');
} else if (!orKey) {
  console.log('\nQdrant: ⚠ Qdrant satt men OPENROUTER_API_KEY saknas (embeddings)');
  failed++;
} else {
  try {
    const { QdrantClient } = await import('@qdrant/js-client-rest');
    const client = new QdrantClient({ url: qUrl, apiKey: qKey });
    await client.getCollections();
    const { embedText, EMBEDDING_MODEL } = await import('../api/embeddings.js');
    await embedText('test');
    console.log(`\nQdrant: ✓ ansluten + embedding (${EMBEDDING_MODEL})`);
  } catch (e) {
    console.log(`\nQdrant: ✗ ${e.message}`);
    failed++;
  }
}

console.log('\nMinne: /api/memory/* (filer + Qdrant-sök om konfigurerat).');
console.log('Grants/discovery fungerar utan Qdrant.\n');

process.exit(failed > 0 ? 1 : 0);
