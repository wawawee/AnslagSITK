import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '..', 'data', 'cache');
const STIFTELSE_INDEX_PATH = path.join(CACHE_DIR, 'stiftelser-index.json');
const STIFTELSE_RAW_PATH = path.join(CACHE_DIR, 'stiftelser.json');

const STIFTELSE_JSON_URL =
  process.env.STIFTELSE_JSON_URL ||
  'https://stiftelser.lansstyrelsen.se/%C3%96ppendata/Json';

const GRANT_PURPOSE_RE =
  /stipend|stipendium|bidrag|forskning|innovation|företag|näringsliv|kultur|utbildning|studie|medel|stöd|utveckling|forskare|vetenskap|teknik|digital|hållbar|miljö|entrepren/i;

/** GDP — en nyckel per myndighet (gdphub.se) */
export const GDP_AGENCIES = [
  { id: 'vinnova', name: 'Vinnova', baseUrl: 'https://api.vinnova.se/gdp_vinnova', envKey: 'GDP_API_KEY_VINNOVA' },
  { id: 'formas', name: 'Formas', baseUrl: 'https://api.formas.se/gdp_formas', envKey: 'GDP_API_KEY_FORMAS' },
  { id: 'forte', name: 'Forte', baseUrl: 'https://api.forte.se/gdp_forte', envKey: 'GDP_API_KEY_FORTE' },
  { id: 'vr', name: 'Vetenskapsrådet', baseUrl: 'https://api.vr.se/gdp_vr', envKey: 'GDP_API_KEY_VR' },
];

let stiftelseIndexCache = null;
let stiftelseIndexMtime = 0;

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

function extractGdpRecords(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.value)) return body.value;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.utlysningar)) return body.utlysningar;
  return [];
}

function gdpRecordToGrant(raw, agencyName) {
  const name =
    pick(raw, ['namn', 'Namn', 'rubrik', 'Rubrik', 'utlysningNamn', 'UtlysningNamn', 'title']) ||
    pick(raw, ['diarienummer', 'Diarienummer']) ||
    'Utlysning';
  const desc =
    pick(raw, ['beskrivning', 'Beskrivning', 'sammanfattning', 'Sammanfattning', 'description']) ||
    pick(raw, ['andamal', 'Andamal']);
  const deadline = pick(raw, [
    'sistaAnsokningsdag',
    'SistaAnsokningsdag',
    'ansokningstidSlut',
    'AnsokningstidSlut',
    'deadline',
    'Deadline',
  ]);
  const url = pick(raw, ['url', 'Url', 'lank', 'Lank', 'link', 'webbadress', 'Webbadress']);
  const amount = pick(raw, ['maxbelopp', 'Maxbelopp', 'belopp', 'Belopp', 'budget', 'Budget']);
  const status = pick(raw, ['status', 'Status']).toLowerCase();

  const funder = agencyName;
  let category = 'other';
  const fl = funder.toLowerCase();
  if (fl.includes('vinnova')) category = 'vinnova';
  else if (fl.includes('formas') || fl.includes('forte') || fl.includes('vetenskapsrådet')) category = 'other';

  return {
    source: 'gdp',
    name,
    funder,
    deadline: deadline || 'Se utlysning',
    maxAmount: amount || undefined,
    description: desc || `Officiell utlysning från ${agencyName} (GDP).`,
    url: url || `https://gdphub.se/`,
    relevance: `Hämtad från GDP API (${agencyName}).`,
    category,
    status: status.includes('stäng') || status.includes('avslut') ? 'closed' : 'open',
  };
}

async function fetchGdpAgency(agency, { limit = 30, offset = 0 } = {}) {
  const apiKey = process.env[agency.envKey]?.trim();
  if (!apiKey) return { agency: agency.id, grants: [], skipped: 'no_api_key' };

  const url = new URL(`${agency.baseUrl}/utlysningar`);
  url.searchParams.set('authorization', apiKey);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${agency.name} GDP ${res.status}: ${text.slice(0, 120)}`);
  }
  const body = await res.json();
  const records = extractGdpRecords(body);
  return {
    agency: agency.id,
    grants: records.map(r => gdpRecordToGrant(r, agency.name)),
    total: records.length,
  };
}

/** Hämta utlysningar från alla konfigurerade GDP-myndigheter */
export async function fetchGdpUtlysningar({ limitPerAgency = 25, searchMode = 'standard' } = {}) {
  const agencies =
    searchMode === 'quick'
      ? GDP_AGENCIES.filter(a => a.id === 'vinnova')
      : GDP_AGENCIES;

  const configured = agencies.filter(a => process.env[a.envKey]?.trim());
  if (configured.length === 0) {
    return { grants: [], meta: { configured: 0, message: 'Inga GDP_API_KEY_* satta (gdphub.se)' } };
  }

  const results = await Promise.allSettled(
    configured.map(a => fetchGdpAgency(a, { limit: limitPerAgency }))
  );

  const grants = [];
  const errors = [];
  for (const r of results) {
    if (r.status === 'fulfilled') grants.push(...r.value.grants);
    else errors.push(r.reason?.message || String(r.reason));
  }

  return {
    grants,
    meta: { configured: configured.length, agencies: configured.map(a => a.id), errors },
  };
}

function tokenizeQuery(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !/^(och|eller|för|med|som|den|det|att|från|till)$/.test(w));
}

function scoreStiftelse(entry, tokens) {
  const hay = `${entry.namn} ${entry.andamal}`.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += t.length > 5 ? 3 : 2;
  }
  if (GRANT_PURPOSE_RE.test(entry.andamal || '')) score += 2;
  return score;
}

function loadStiftelseIndexFromDisk() {
  if (!fs.existsSync(STIFTELSE_INDEX_PATH)) return null;
  const stat = fs.statSync(STIFTELSE_INDEX_PATH);
  if (stiftelseIndexCache && stat.mtimeMs === stiftelseIndexMtime) return stiftelseIndexCache;
  const raw = fs.readFileSync(STIFTELSE_INDEX_PATH, 'utf8');
  stiftelseIndexCache = JSON.parse(raw);
  stiftelseIndexMtime = stat.mtimeMs;
  return stiftelseIndexCache;
}

/** Sök i indexerad stiftelsedata (kör npm run sync:stiftelser först) */
export function searchStiftelser(query, { limit = 15, orgDescription = '' } = {}) {
  const index = loadStiftelseIndexFromDisk();
  if (!index?.entries?.length) {
    return {
      grants: [],
      meta: {
        available: false,
        message: 'Kör: npm run sync:stiftelser (index saknas i data/cache/)',
      },
    };
  }

  const tokens = [...new Set([...tokenizeQuery(query), ...tokenizeQuery(orgDescription)])].slice(0, 12);
  if (tokens.length === 0) tokens.push('bidrag', 'stipendium', 'forskning');

  const scored = index.entries
    .map(e => ({ e, score: scoreStiftelse(e, tokens) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const grants = scored.map(({ e }) => ({
    source: 'stiftelse-register',
    name: e.namn,
    funder: e.namn,
    deadline: 'Kontakta stiftelsen / se register',
    description: (e.andamal || '').slice(0, 500),
    url: `https://stiftelser.lansstyrelsen.se/`,
    relevance: `Match i Länsstyrelsens stiftelseregister (${e.ort || 'Sverige'}). Ändamål kan inkludera bidrag/stipendier.`,
    category: 'stiftelse',
    status: 'open',
    meta: { orgnr: e.orgnr, id: e.id },
  }));

  return {
    grants,
    meta: { available: true, indexed: index.entries.length, matched: scored.length },
  };
}

async function swecrisFetch(pathSuffix, params = {}) {
  const token = process.env.SWECRIS_API_KEY?.trim();
  if (!token) return null;
  const url = new URL(`https://swecris-api.vr.se/v1${pathSuffix}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Swecris ${res.status}`);
  return res.json();
}

/** Swecris SCP-sök — historiska projekt/finansiärer (ledtrådar, inte öppna utlysningar) */
export async function fetchSwecrisHints(query, { limit = 8 } = {}) {
  if (!process.env.SWECRIS_API_KEY?.trim()) {
    return { grants: [], meta: { available: false, message: 'SWECRIS_API_KEY saknas (vr.se/swecris-api)' } };
  }

  const data = await swecrisFetch('/scp/search', {
    searchText: (query || 'innovation').slice(0, 200),
    size: limit,
    page: 1,
  });

  const rows = data?.results || data?.items || (Array.isArray(data) ? data : []);
  const grants = rows.slice(0, limit).map(row => {
    const title = row.projectTitleSv || row.projectTitleEn || row.projectTitle || 'Forskningsprojekt';
    const funderName =
      row.fundingOrganisationNameSv ||
      row.fundingOrganisationNameEn ||
      row.fundingOrganisation ||
      'Finansiär';
    const amount = row.fundingAmountSek || row.totalFundingAmountSek;
    return {
      source: 'swecris',
      name: `${funderName}: «${title}»`,
      funder: funderName,
      deadline: 'Historik (Swecris) — kontrollera aktuella utlysningar hos finansiären',
      maxAmount: amount ? `${Math.round(amount).toLocaleString('sv-SE')} kr` : undefined,
      description: (row.projectAbstractSv || row.projectAbstractEn || '').slice(0, 400),
      url: 'https://swecris.vr.se/',
      relevance: 'Liknande beviljat projekt i Swecris — använd för att hitta rätt finansiär.',
      category: /stiftelse|fond|kamprad|jubileumsfond|kk-stiftelsen/i.test(funderName) ? 'stiftelse' : 'other',
      status: 'closed',
    };
  });

  return { grants, meta: { available: true, matched: grants.length } };
}

/** Strukturerade rader → markdown för LLM-syntes */
export function officialGrantsToMarkdown(grants, sectionTitle) {
  if (!grants?.length) return '';
  const blocks = grants.map(g => {
    return `## ${g.name}
- **Finansiär**: ${g.funder}
- **Deadline**: ${g.deadline}
- **Maxbelopp**: ${g.maxAmount || '—'}
- **Beskrivning**: ${g.description}
- **Relevans**: ${g.relevance}
- **URL**: ${g.url}
- **Källa**: ${g.source}`;
  });
  return `\n### ${sectionTitle}\n${blocks.join('\n\n')}\n`;
}

export function getOfficialSourcesStatus() {
  const gdpKeys = GDP_AGENCIES.filter(a => process.env[a.envKey]?.trim()).map(a => a.id);
  const stiftelseIndex = fs.existsSync(STIFTELSE_INDEX_PATH);
  const stiftelseRaw = fs.existsSync(STIFTELSE_RAW_PATH);
  return {
    gdp: { configured: gdpKeys.length, agencies: gdpKeys, portal: 'https://gdphub.se/' },
    stiftelser: {
      indexReady: stiftelseIndex,
      rawCached: stiftelseRaw,
      syncCommand: 'npm run sync:stiftelser',
    },
    swecris: {
      configured: !!process.env.SWECRIS_API_KEY?.trim(),
      portal: 'https://swecris.vr.se/',
    },
  };
}

/** Bygg kompakt index från full JSON (används av sync-script) */
export function buildStiftelseIndexFromRaw(rawJson) {
  const list = rawJson?.STIFTELSER || [];
  const entries = [];
  for (const item of list) {
    const s = item?.STIFTELSE;
    if (!s?.NAMN) continue;
    const andamal = s.ANDAMAL || '';
    if (!GRANT_PURPOSE_RE.test(andamal) && andamal.length < 20) continue;
    entries.push({
      id: s.ID,
      namn: s.NAMN,
      orgnr: s.ORGNR,
      ort: s.ORT,
      andamal: andamal.slice(0, 800),
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    source: STIFTELSE_JSON_URL,
    totalInRegister: list.length,
    entries,
  };
}

export async function downloadStiftelseRegister() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const res = await fetch(STIFTELSE_JSON_URL, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`Stiftelse JSON ${res.status}`);
  const text = await res.text();
  fs.writeFileSync(STIFTELSE_RAW_PATH, text, 'utf8');
  const raw = JSON.parse(text);
  const index = buildStiftelseIndexFromRaw(raw);
  fs.writeFileSync(STIFTELSE_INDEX_PATH, JSON.stringify(index), 'utf8');
  stiftelseIndexCache = index;
  stiftelseIndexMtime = Date.now();
  return {
    rawBytes: text.length,
    totalInRegister: index.totalInRegister,
    indexed: index.entries.length,
    paths: { raw: STIFTELSE_RAW_PATH, index: STIFTELSE_INDEX_PATH },
  };
}

/** Hämta officiella källor enligt sökläge */
export async function collectOfficialSourceData({ query, orgProfile, searchMode = 'standard', targetCount = 10 }) {
  const useBroad = searchMode === 'broad';
  const useStandard = searchMode === 'standard' || useBroad;
  const orgDesc = orgProfile?.description || '';

  const tasks = [];

  if (useStandard || useBroad) {
    tasks.push(
      fetchGdpUtlysningar({
        limitPerAgency: useBroad ? Math.min(40, targetCount * 2) : 20,
        searchMode,
      }).then(r => ({ type: 'gdp', ...r }))
    );
  }

  if (useBroad) {
    tasks.push(
      Promise.resolve(searchStiftelser(query, { limit: Math.min(20, targetCount + 5), orgDescription: orgDesc })).then(
        r => ({ type: 'stiftelser', ...r })
      )
    );
    tasks.push(
      fetchSwecrisHints(query, { limit: Math.min(8, Math.ceil(targetCount / 2)) }).then(r => ({
        type: 'swecris',
        ...r,
      }))
    );
  }

  const settled = await Promise.all(tasks);
  const allGrants = [];
  const meta = {};

  for (const block of settled) {
    meta[block.type] = block.meta || {};
    if (block.grants?.length) allGrants.push(...block.grants);
  }

  const filtered = filterOfficialByQuery(allGrants, query, orgDesc);

  return {
    grants: filtered.slice(0, Math.max(targetCount * 2, 20)),
    meta,
    markdown: [
      officialGrantsToMarkdown(
        filtered.filter(g => g.source === 'gdp'),
        'Officiella utlysningar (GDP — Vinnova, Formas, Forte, VR)'
      ),
      officialGrantsToMarkdown(
        filtered.filter(g => g.source === 'stiftelse-register'),
        'Stiftelser (Länsstyrelsens register)'
      ),
      officialGrantsToMarkdown(
        filtered.filter(g => g.source === 'swecris'),
        'Finansiärer med liknande beviljade projekt (Swecris)'
      ),
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function filterOfficialByQuery(grants, query, orgDesc) {
  const tokens = tokenizeQuery(`${query} ${orgDesc}`);
  if (tokens.length === 0) return grants;
  return grants
    .map(g => {
      const hay = `${g.name} ${g.description} ${g.funder}`.toLowerCase();
      const score = tokens.reduce((s, t) => (hay.includes(t) ? s + 1 : s), 0);
      return { g, score };
    })
    .filter(x => x.score > 0 || x.g.source === 'gdp')
    .sort((a, b) => b.score - a.score)
    .map(x => x.g);
}
