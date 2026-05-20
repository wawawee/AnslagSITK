import OpenAI from 'openai';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';
import { MemoryService } from './services/memoryService.js';
import {
  collectOfficialSourceData,
  getOfficialSourcesStatus,
  downloadStiftelseRegister,
} from './services/officialSources.js';
import { getModelCandidates, MODEL_TIER, resolveModelSettings } from './modelRouter.js';
import { CURATED_MODELS, MODEL_PRESETS } from './curatedModels.js';
import { isQdrantConfigured } from './qdrantConfig.js';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from './embeddings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Funding Entities ---
// PII (personnummer, telefon) hämtas från miljövariabler av säkerhetsskäl
const FUNDING_ENTITIES = [
  {
    id: 'per-brinell',
    name: 'Per Brinell',
    orgNr: process.env.ENTITY_PER_ORGNR || '',
    phone: process.env.ENTITY_PER_PHONE || '',
    type: 'private',
    description: 'Privatperson — innovatör och utvecklare inom AI, systemarkitektur och digital transformation.',
    focusAreas: ['AI-utveckling', 'Systemarkitektur', 'Open Source', 'Digital innovation'],
    strengths: ['Full-stack utveckling', 'AI/ML', 'DevOps', 'Projektledning'],
    partnerships: [],
    region: 'Gävleborg',
  },
  {
    id: 'sitk',
    name: 'Sandvikens IT-Kår',
    orgNr: process.env.ENTITY_SITK_ORGNR || '',
    phone: process.env.ENTITY_SITK_PHONE || '',
    type: 'nonprofit',
    description: 'Digital katalysator för Sandviken — främjar AI, digital hållbarhet och regional utveckling genom utbildning, innovation och samverkan.',
    focusAreas: ['AI', 'Digital hållbarhet', 'Regional utveckling', 'Utbildning', 'Innovation'],
    strengths: ['Gemenskap', 'Utbildning', 'AI-kompetens', 'Regional förankring'],
    partnerships: ['Göranssonska stiftelserna', 'Region Gävleborg', 'Sandvikens kommun'],
    region: 'Gävleborg',
  },
  {
    id: 'klattertrader',
    name: 'Klätterträder AB',
    orgNr: process.env.ENTITY_KLATTERTRADER_ORGNR || '',
    phone: process.env.ENTITY_KLATTERTRADER_PHONE || '',
    type: 'company',
    description: 'Teknikkonsult och produktutveckling inom klätterutrustning, äventyrsprodukter och innovativa materiallösningar.',
    focusAreas: ['Produktutveckling', 'Materialinnovation', 'Hållbarhet', 'Äventyrssport'],
    strengths: ['Innovation', 'Produktdesign', 'Materialkunskap', 'Hållbarhetstänk'],
    partnerships: [],
    region: 'Gävleborg',
  },
  {
    id: 'twistedstacks',
    name: 'TwistedStacks',
    orgNr: process.env.ENTITY_TWISTEDSTACKS_ORGNR || '',
    phone: process.env.ENTITY_TWISTEDSTACKS_PHONE || '',
    type: 'company',
    description:
      'AI-driven produktstudio som utvecklar specialiserad mjukvara för SME, rådgivare och regional utveckling — portfölj inkl. SkatteRevision, AnslagSITK, LAGA och EnergiRevision. Enskild firma, AB planeras.',
    focusAreas: [
      'AI och beslutsstöd',
      'SME-digitalisering',
      'Skatte- och redovisningstech',
      'Legal tech',
      'Energi och klimat',
      'Innovationsfinansiering',
    ],
    strengths: [
      'Multi-agent AI',
      'Öppen myndighetsdata',
      'Domänkunskap skatt/energi/juridik',
      'Produktportfölj',
      'Spårbar analys',
    ],
    partnerships: ['Sandvikens IT-Kår'],
    region: 'Gävleborg',
  },
  {
    id: 'horizonten',
    name: 'Horizonten Holding',
    orgNr: process.env.ENTITY_HORIZONTEN_ORGNR || '',
    phone: process.env.ENTITY_HORIZONTEN_PHONE || '',
    type: 'holding',
    description: 'Holdingbolag för teknikinvesteringar — fokuserar på AI-drivna startups, digital infrastruktur och långsiktiga teknikplaceringar.',
    focusAreas: ['AI-investeringar', 'Tech-startups', 'Digital infrastruktur', 'Framtidsteknik'],
    strengths: ['Investeringsstrategi', 'Tech-due diligence', 'Portföljförvaltning', 'AI-expertis'],
    partnerships: [],
    region: 'Gävleborg',
  },
];

// --- OpenRouter Multi-Key Multi-Model Setup ---
// OPENROUTER_API_KEY (t.ex. Vercel) används som fallback för alla zoner
const orKey = (...envNames) => {
  for (const name of envNames) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return process.env.OPENROUTER_API_KEY?.trim() || '';
};

const mkOpenRouterClient = (key) => {
  if (!key) return null; // hoppa över zonen om nyckel saknas
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: key,
    defaultHeaders: {
      'HTTP-Referer': 'https://sitk.se',
      'X-OpenRouter-Title': 'AnslagSITK',
    },
  });
};

// 7 zoner — 6 konton + 1 backup-nyckel
// Varje zon = egen API-nyckel + egna modellpreferenser
// OpenRouter hanterar automatisk provider-failover VID SIDAN AV vår key-rotation
const ZONE_MAP = [
  {
    name: 'Zon 1 (pellegrosso — Claude)',
    client: mkOpenRouterClient(orKey('OPENROUTER_KEY_PELLEGROSSO')),
    models: {
      reason: 'anthropic/claude-3.5-sonnet',
      pro:    'anthropic/claude-3.5-sonnet',
      fast:   'google/gemini-2.5-flash',
    },
  },
  {
    name: 'Zon 2 (cymwave — OpenAI)',
    client: mkOpenRouterClient(orKey('OPENROUTER_KEY_CYMWAVE')),
    models: {
      reason: 'openai/o3-mini',
      pro:    'openai/gpt-4o',
      fast:   'openai/gpt-4o-mini',
    },
  },
  {
    name: 'Zon 3 (carl — Gemini)',
    client: mkOpenRouterClient(orKey('OPENROUTER_KEY_CARL')),
    models: {
      reason: 'google/gemini-2.5-pro',
      pro:    'google/gemini-2.5-pro',
      fast:   'google/gemini-2.5-flash',
    },
  },
  {
    name: 'Zon 4 (hlivfa — Llama)',
    client: mkOpenRouterClient(orKey('OPENROUTER_KEY_HLIVFA')),
    models: {
      reason: 'meta-llama/llama-3.1-70b-instruct',
      pro:    'meta-llama/llama-3.1-405b-instruct',
      fast:   'meta-llama/llama-3.1-8b-instruct',
    },
  },
  {
    name: 'Zon 5 (perbrinell — Claude)',
    client: mkOpenRouterClient(orKey('OPENROUTER_KEY_PERBRINELL')),
    models: {
      reason: 'anthropic/claude-3.5-sonnet',
      pro:    'anthropic/claude-3.5-sonnet',
      fast:   'openai/gpt-4o-mini',
    },
  },
  {
    name: 'Zon 6 (leadagenticos — OpenAI)',
    client: mkOpenRouterClient(orKey('OPENROUTER_KEY_LEADAGENTICOS')),
    models: {
      reason: 'openai/gpt-4o',
      pro:    'openai/gpt-4o',
      fast:   'openai/gpt-4o-mini',
    },
  },
  {
    name: 'Zon 7 (perbrinell MAP — backup)',
    client: mkOpenRouterClient(orKey('OPENROUTER_KEY_PERBRINELL_MAP')),
    models: {
      reason: 'google/gemini-2.5-flash',
      pro:    'google/gemini-2.5-flash',
      fast:   'google/gemini-2.5-flash',
    },
  },
];

const DEDICATED_OR_KEYS = [
  'OPENROUTER_KEY_PELLEGROSSO', 'OPENROUTER_KEY_CYMWAVE', 'OPENROUTER_KEY_CARL',
  'OPENROUTER_KEY_HLIVFA', 'OPENROUTER_KEY_PERBRINELL', 'OPENROUTER_KEY_LEADAGENTICOS',
  'OPENROUTER_KEY_PERBRINELL_MAP',
];

// En delad nyckel → en zon med modeller som fungerar på OpenRouter (undvik 404)
const usesSharedKeyOnly =
  !!process.env.OPENROUTER_API_KEY?.trim() &&
  !DEDICATED_OR_KEYS.some((k) => process.env[k]?.trim());

const LLM_ZONES = usesSharedKeyOnly
  ? [{
      name: 'OpenRouter (OPENROUTER_API_KEY)',
      client: mkOpenRouterClient(process.env.OPENROUTER_API_KEY),
      cascade: true,
    }]
  : ZONE_MAP.map((z) => ({ ...z, cascade: false }));

async function openRouterChat(client, model, prompt, zoneName = 'unknown') {
  // o-series modeller använder max_completion_tokens och stödjer inte temperature
  const isOSeries = /^o\d|^openai\/o\d/i.test(model);
  const params = {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_completion_tokens: 4096,
  };
  if (!isOSeries) params.temperature = 0.7;
  const response = await client.chat.completions.create(params);
  return response.choices[0].message.content;
}

// mode: 'pro' (synthesis/proposals) | 'reason' (planning/analysis) | 'fast' (quick tasks)
async function generateWithFallback(prompt, mode = 'pro', modelSettings = null) {
  if (mode === true) mode = 'pro';
  if (mode === false) mode = 'reason';

  for (const zone of LLM_ZONES) {
    if (!zone.client) {
      console.warn(`⚠ OpenRouter ${zone.name} hoppas över — ingen API-nyckel`);
      continue;
    }

    const models = zone.cascade
      ? getModelCandidates(mode, modelSettings)
      : [zone.models[mode] || zone.models.pro];

    for (const model of models) {
      try {
        const result = await openRouterChat(zone.client, model, prompt, zone.name);
        console.log(`✅ OpenRouter ${zone.name} [${mode}/${MODEL_TIER}]: ${model}`);
        return result;
      } catch (err) {
        console.warn(`⚠ ${zone.name} / ${model}: ${err.message}`);
      }
    }
  }
  throw new Error(`Alla modeller misslyckades (tier=${MODEL_TIER})`);
}

// --- Exa Web Search (ersätter Google Grounding) ---
const EXA_API_KEY = process.env.EXA_API_KEY;

async function runExaSearch(query, taskId = null) {
  const logMsg = `🔍 Exa söker: "${query.substring(0, 80)}..."`;
  if (taskId) updateTaskStatus(taskId, logMsg);
  console.log(logMsg);

  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_API_KEY,
      },
      body: JSON.stringify({
        query,
        numResults: 5,
        useAutoprompt: true,
        type: 'neural',
        contents: { text: { maxCharacters: 2000 } },
      }),
    });

    if (!response.ok) throw new Error(`Exa API ${response.status}: ${await response.text()}`);
    const data = await response.json();

    const output = data.results
      .map(r => `**${r.title}**\nURL: ${r.url}\n${r.text || ''}`)
      .join('\n\n---\n\n');

    return { output };
  } catch (err) {
    console.error('Exa search failed:', err.message);
    // Fallback: låt OpenRouter generera svar utan live-data
    const fallbackPrompt = `Du är en researcher om svenska anslag. Svara på frågan baserat på din kunskap om: ${query}. Fokusera på utlysningar 2025-2026. Ge konkreta finansiärer, belopp och URLer.`;
    const text = await generateWithFallback(fallbackPrompt, 'pro');
    return { output: text };
  }
}

// --- Task tracking ---
const discoveryTasks = new Map();

/** Vercel serverless: varje request = ny process — in-memory tasks fungerar inte mellan poll-anrop. */
const useInlineGrantSearch = () => !!process.env.VERCEL;

function updateTaskStatus(taskId, message) {
  const task = discoveryTasks.get(taskId);
  if (task) {
    task.status = message;
    task.logs.push({ timestamp: new Date().toISOString(), message });
    console.log(`[Task ${taskId}] ${message}`);
  }
}

// --- Routes ---

const OPENROUTER_KEY_ENV_NAMES = [
  'OPENROUTER_API_KEY',
  'OPENROUTER_KEY_PELLEGROSSO', 'OPENROUTER_KEY_CYMWAVE', 'OPENROUTER_KEY_CARL',
  'OPENROUTER_KEY_HLIVFA', 'OPENROUTER_KEY_PERBRINELL', 'OPENROUTER_KEY_LEADAGENTICOS',
  'OPENROUTER_KEY_PERBRINELL_MAP',
];

const ALLOWED_MEMORY_FILES = new Set(['AGENTS.md', 'MEMORY.md', 'WORKING.md']);
const AGENT_DIR = path.join(__dirname, '..', '.agent');
const MEMORY_DIR = path.join(AGENT_DIR, 'memory');

app.get('/api/health', (req, res) => {
  const activeZones = LLM_ZONES.filter(z => z.client).length;
  res.json({
    status: activeZones > 0 ? 'ok' : 'degraded',
    apiVersion: '3-official-sources',
    timestamp: new Date().toISOString(),
    backend: usesSharedKeyOnly ? 'OpenRouter (shared key)' : 'OpenRouter (multi-zone)',
    openRouter: {
      zonesActive: activeZones,
      zonesTotal: LLM_ZONES.length,
      keysConfigured: OPENROUTER_KEY_ENV_NAMES.filter(k => process.env[k]?.trim()).length,
      sharedKey: !!process.env.OPENROUTER_API_KEY?.trim(),
      mode: usesSharedKeyOnly ? 'shared' : 'multi',
      modelTier: MODEL_TIER,
      modelCascade: getModelCandidates('pro').slice(0, 6),
    },
    zones: LLM_ZONES.map(z => ({
      name: z.name,
      active: !!z.client,
      cascade: !!z.cascade,
      models: z.cascade ? getModelCandidates('pro') : z.models,
    })),
    search: EXA_API_KEY ? 'Exa (live)' : 'LLM fallback',
    officialSources: getOfficialSourcesStatus(),
    memory: {
      qdrant: isQdrantConfigured(),
      embeddingModel: EMBEDDING_MODEL,
      vectorSize: EMBEDDING_DIMENSIONS,
      apiRoutes: true,
    },
    entities: FUNDING_ENTITIES.length,
    hint: activeZones === 0 ? 'Sätt OPENROUTER_API_KEY i .env eller Vercel. Kör: npm run validate' : undefined,
  });
});

// --- Agent memory (.agent/ + valfri Qdrant) ---
app.get('/api/memory/logs', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const logPath = path.join(MEMORY_DIR, `${today}.md`);
    const content = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8') : '';
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/memory/:filename', async (req, res) => {
  const { filename } = req.params;
  if (!ALLOWED_MEMORY_FILES.has(filename)) {
    return res.status(400).json({ error: 'Ogiltig fil' });
  }
  const content = await MemoryService.readFile(filename);
  res.json({ content: content ?? '' });
});

app.post('/api/memory/:filename', async (req, res) => {
  const { filename } = req.params;
  if (!ALLOWED_MEMORY_FILES.has(filename)) {
    return res.status(400).json({ error: 'Ogiltig fil' });
  }
  await MemoryService.writeFile(filename, req.body?.content ?? '');
  res.json({ success: true });
});

app.post('/api/memory/search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query?.trim()) return res.json({ results: [] });
    const results = await MemoryService.searchMemory(query.trim());
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Entity Endpoints ---
app.get('/api/entities', (req, res) => {
  res.json({ entities: FUNDING_ENTITIES });
});

app.get('/api/entities/:id', (req, res) => {
  const entity = FUNDING_ENTITIES.find(e => e.id === req.params.id);
  if (!entity) return res.status(404).json({ error: 'Entitet hittades inte' });
  res.json({ entity });
});

// --- Portfolio Integration (privat verktyg — ingen auth) ---

const ARCHIVE_PATH = process.env.GITHUB_ARCHIVE_PATH || path.join(process.env.HOME || '/tmp', 'Projects/github-archive');

// Enkel validering av kontonamn
function safeAccount(name) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return null;
  return name;
}

app.get('/api/portfolio/accounts', (req, res) => {
  try {
    if (!fs.existsSync(ARCHIVE_PATH)) {
      return res.json({ accounts: [] });
    }
    const accounts = fs.readdirSync(ARCHIVE_PATH, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const accountPath = path.join(ARCHIVE_PATH, d.name);
        const repos = fs.readdirSync(accountPath, { withFileTypes: true })
          .filter(r => r.isDirectory())
          .map(r => ({
            name: r.name,
            path: path.join(accountPath, r.name),
          }));
        return { account: d.name, repoCount: repos.length, repos };
      });
    res.json({ accounts });
  } catch (err) {
    console.error('Portfolio accounts error:', err.message);
    res.status(500).json({ error: 'Kunde inte läsa portföljen' });
  }
});

app.get('/api/portfolio/account/:account', (req, res) => {
  try {
    const name = safeAccount(req.params.account);
    if (!name) return res.status(400).json({ error: 'Ogiltigt kontonamn' });
    const accountPath = path.join(ARCHIVE_PATH, name);
    if (!fs.existsSync(accountPath)) {
      return res.status(404).json({ error: 'Konto hittades inte' });
    }
    const repos = fs.readdirSync(accountPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const repoPath = path.join(accountPath, d.name);
        let readme = '';
        const readmePath = path.join(repoPath, 'README.md');
        if (fs.existsSync(readmePath)) {
          readme = fs.readFileSync(readmePath, 'utf-8').substring(0, 500);
        }
        let pkg = null;
        const pkgPath = path.join(repoPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
          try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')); } catch {}
        }
        return {
          name: d.name,
          readme: readme || null,
          packageJson: pkg ? { name: pkg.name, description: pkg.description, version: pkg.version } : null,
        };
      });
    res.json({ account: name, repoCount: repos.length, repos });
  } catch (err) {
    console.error('Portfolio account error:', err.message);
    res.status(500).json({ error: 'Kunde inte läsa kontot' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'sitk_admin';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'pell0pell0';
  const validPasswords = new Set([ADMIN_PASSWORD, 'pelle', 'pell0pell0', 'samithecrab']);
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && validPasswords.has(password)) {
    res.json({ success: true, token: 'sitk-auth-token-v1', user: { name: 'Admin', role: 'admin' } });
  } else {
    res.status(401).json({ error: 'Ogiltiga inloggningsuppgifter' });
  }
});

app.post('/api/auth/logout', (req, res) => res.json({ success: true }));

app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token === 'sitk-auth-token-v1') {
    res.json({ user: { name: 'Admin', role: 'admin' } });
  } else {
    res.status(401).json({ error: 'Inte inloggad' });
  }
});

/** Bredd: myndigheter + stiftelser/fonder (Exa-sökplan + officiella register) */
const GRANT_SOURCE_HINTS = [
  'GDP API (gdphub.se): Vinnova, Formas, Forte, Vetenskapsrådet — utlysningar',
  'Länsstyrelsens stiftelseregister (stiftelser.lansstyrelsen.se)',
  'Swecris (swecris.vr.se) — historiska finansiärer och projekt',
  'Vinnova (vinnova.se)',
  'Tillväxtverket (tillvaxtverket.se)',
  'Region/län/kommun (regiongavleborg.se, region.se)',
  'EU (europa.eu, Horizon, Digital Europe)',
  'Almi (almi.se)',
  'Stiftelser: Postkodstiftelsen, Allmänna arvsfonden, Familjen Kamprads, Göranssonska, Stiftelsen för strategisk forskning, Riksbankens jubileumsfond',
  'Fondbaser: lärarstiftelsen, SKANDIA idéer för livet, Vinnova adjacent privata fonder',
  'Svenska institutet, Formas, Energimyndigheten utlysningar',
];

function exaStepsForMode(mode, targetCount = 10) {
  if (mode === 'quick') return 2;
  if (mode === 'broad') return Math.min(7, Math.max(5, Math.ceil(targetCount / 2)));
  return Math.min(5, Math.max(3, Math.ceil(targetCount / 3)));
}

function buildFallbackSearchSteps(userQuery, region, mode, targetCount) {
  const base = [
    `Vinnova utlysning ${userQuery} 2026`,
    `Tillväxtverket bidrag ${region} ${userQuery}`,
    `Almi finansiering ${userQuery} SME`,
    `Region ${region} bidrag utlysning innovation`,
    `EU Horizon Digital Europe ${userQuery} Sverige`,
    `Postkodstiftelsen OR Allmänna arvsfonden utlysning ${userQuery}`,
    `svensk stiftelse fond utlysning bidrag ${userQuery} 2026`,
    `Familjen Kamprads stiftelse OR Göranssonska utlysning`,
    `Formas OR Energimyndigheten utlysning ${userQuery}`,
  ];
  const n = exaStepsForMode(mode, targetCount);
  return base.slice(0, n);
}

const GRANT_OUTPUT_FORMAT = `
## [Namn på utlysningen]
- **Finansiär**: [Namn]
- **Deadline**: [Datum YYYY-MM-DD eller Löpande]
- **Maxbelopp**: [Summa]
- **Beskrivning**: [2-3 meningar]
- **Relevans**: [Varför passar detta sökande?]
- **URL**: [https://...]`;

function buildOrgSearchContext(orgProfile) {
  const orgName = orgProfile?.name || 'sökande organisation';
  const orgDesc = orgProfile?.description || '';
  const focus = (orgProfile?.focusAreas || []).join(', ');
  const region = orgProfile?.region || 'Sverige';
  return { orgName, orgDesc, focus, region };
}

/** Exa + LLM — delad pipeline för sök, deep search och discovery */
async function runGrantSearchPipeline({
  query,
  orgProfile,
  filters,
  maxExaSteps = 2,
  targetCount = 8,
  searchMode = 'standard',
  taskId = null,
  modelSettings = null,
}) {
  const log = (message) => {
    if (taskId) updateTaskStatus(taskId, message);
  };

  const { orgName, orgDesc, focus, region } = buildOrgSearchContext(orgProfile);
  const userQuery = (query || '').trim() || orgDesc || 'innovationsstöd SME digitalisering Sverige 2026';
  const categoryHint = filters?.category ? ` Kategori: ${filters.category}.` : '';

  log(`Startar sökning för ${orgName}: "${userQuery.substring(0, 60)}${userQuery.length > 60 ? '…' : ''}"`);

  let officialData = { grants: [], meta: {}, markdown: '' };
  try {
    log('Hämtar officiella källor (GDP / stiftelser / Swecris)…');
    officialData = await collectOfficialSourceData({
      query: userQuery,
      orgProfile,
      searchMode,
      targetCount,
    });
    const parts = [];
    if (officialData.meta.gdp?.configured) parts.push(`GDP (${officialData.meta.gdp.agencies?.join(', ') || '—'})`);
    if (officialData.meta.stiftelser?.available) parts.push(`stiftelser (${officialData.grants.filter(g => g.source === 'stiftelse-register').length})`);
    if (officialData.meta.swecris?.available) parts.push('Swecris');
    log(
      parts.length
        ? `✓ Officiella källor: ${officialData.grants.length} träffar (${parts.join(' · ')})`
        : `Officiella källor: ${officialData.meta.gdp?.message || officialData.meta.stiftelser?.message || 'konfigurera API-nycklar / sync:stiftelser'}`
    );
  } catch (err) {
    log(`⚠ Officiella källor: ${err.message}`);
  }

  const sourceList = searchMode === 'broad'
    ? GRANT_SOURCE_HINTS.join('; ')
    : GRANT_SOURCE_HINTS.slice(0, 5).join('; ');

  const planPrompt = `Du planerar webbsökning efter svenska utlysningar och finansiering (2025-2026).
Organisation: ${orgName}
Beskrivning: ${orgDesc}
Fokus: ${focus}
Region: ${region}
Sökämne: "${userQuery}"${categoryHint}
Mål: hitta cirka ${targetCount} distinkta utlysningar.
Sökläge: ${searchMode} — fördela sökningar över FLERA källtyper, inte bara Vinnova/Tillväxtverket.

Källtyper att täcka: ${sourceList}

Returnera ENDAST en JSON-array med exakt ${maxExaSteps} korta söksträngar (svenska).
Minst hälften ska rikta mot stiftelser, fonder, Almi eller regionala aktörer om läget är "broad".
Varje sträng ska vara unik och söka på olika webbplatser.
Svar:`;

  let searchSteps = [];
  log('Planerar sökstrategi med AI...');
  try {
    const planText = await generateWithFallback(planPrompt, 'reason', modelSettings);
    const jsonMatch = planText.match(/\[[\s\S]*\]/);
    searchSteps = JSON.parse(jsonMatch ? jsonMatch[0] : planText);
    searchSteps = searchSteps
      .map(s => (typeof s === 'string' ? s : s.query || s.sökterm || JSON.stringify(s)))
      .filter(Boolean)
      .slice(0, maxExaSteps);
  } catch {
    searchSteps = buildFallbackSearchSteps(userQuery, region, searchMode, targetCount);
  }

  log(`Sökplan klar — ${searchSteps.length} webbsökning(ar): ${searchSteps.join(' · ').substring(0, 120)}`);

  const exaResults = [];
  if (maxExaSteps === 0) {
    log('Exa ej konfigurerad — hoppar över live-sökning');
  }
  for (let i = 0; i < searchSteps.length; i++) {
    const step = searchSteps[i];
    log(`Exa ${i + 1}/${searchSteps.length}: ${step}`);
    try {
      const result = await runExaSearch(String(step), taskId);
      exaResults.push({ step, output: result.output?.substring(0, 3500) || '' });
      log(`✓ Exa-steg ${i + 1} klart`);
    } catch (err) {
      exaResults.push({ step, output: '', error: err.message });
      log(`⚠ Exa-steg ${i + 1} misslyckades: ${err.message}`);
    }
  }

  log('Syntetiserar utlysningar från sökresultat...');
  const synthesisPrompt = `Du är expert på svenska anslag. Hjälp "${orgName}" hitta VERKLIGA, aktuella utlysningar.
${orgDesc ? `Verksamhet: ${orgDesc}` : ''}
${focus ? `Fokus: ${focus}` : ''}
Sökämne: "${userQuery}"

Rådata från webbsökning:
${JSON.stringify(exaResults, null, 1)}

Officiella register (prioritera dessa om relevanta — verifierade källor):
${officialData.markdown || '(inga officiella träffar denna gång)'}

Regler:
- Lista upp till ${targetCount} utlysningar om underlaget räcker; annars färre men ärligt.
- Blanda källor: max 40% från samma finansiär (t.ex. inte bara Vinnova).
- Inkludera gärna stiftelser och privata fonder om de finns i rådatan.
- Varje post MÅSTE ha en giltig https-URL från rådatan eller känd webbplats.
- Hitta inte på utlysningar som inte stöds av källorna.
- Skriv på svenska.

Använd EXAKT detta format per utlysning:
${GRANT_OUTPUT_FORMAT}`;

  const output = await generateWithFallback(synthesisPrompt, 'pro', modelSettings);
  log('Syntes klar — resultat redo');
  return {
    output,
    searchSteps,
    usedExa: !!EXA_API_KEY && maxExaSteps > 0,
    officialSources: officialData.meta,
    officialCount: officialData.grants.length,
  };
}

function snapshotTask(taskId) {
  const task = discoveryTasks.get(taskId);
  if (!task) return null;
  return {
    result: task.result,
    searchSteps: task.searchSteps || [],
    completed: task.completed,
    status: task.status,
    warning: task.warning,
    source: task.source,
    officialSources: task.officialSources,
    officialCount: task.officialCount,
  };
}

async function executeGrantSearchTask(taskId, reqBody, maxExaSteps, pipelineOpts = {}) {
  try {
    const { query, filters, orgProfile, targetCount = 8, searchMode = 'standard', modelSettings } = reqBody;

    if (!EXA_API_KEY) {
      updateTaskStatus(taskId, 'EXA_API_KEY saknas — använder endast AI-kunskap');
      const { orgName } = buildOrgSearchContext(orgProfile);
      const fallback = await generateWithFallback(
        `Lista 5-8 aktuella svenska utlysningar för ${orgName} relaterade till: "${query || orgProfile?.description}".${GRANT_OUTPUT_FORMAT}`,
        'pro',
        modelSettings
      );
      const taskObj = discoveryTasks.get(taskId);
      if (taskObj) {
        taskObj.result = fallback;
        taskObj.completed = true;
        taskObj.status = 'Klar (utan Exa)';
        taskObj.warning = 'EXA_API_KEY saknas';
      }
      return snapshotTask(taskId);
    }

    const { output, searchSteps, usedExa, officialSources, officialCount } = await runGrantSearchPipeline({
      query,
      orgProfile,
      filters,
      maxExaSteps,
      targetCount,
      searchMode,
      taskId,
      modelSettings,
      ...pipelineOpts,
    });

    const taskObj = discoveryTasks.get(taskId);
    if (taskObj) {
      taskObj.result = output;
      taskObj.searchSteps = searchSteps;
      taskObj.source = usedExa ? 'exa+official+llm' : 'official+llm';
      taskObj.officialSources = officialSources;
      taskObj.officialCount = officialCount;
      taskObj.completed = true;
      taskObj.status = 'Klar!';
    }
    return snapshotTask(taskId);
  } catch (error) {
    const taskObj = discoveryTasks.get(taskId);
    if (taskObj) {
      taskObj.status = `Fel: ${error.message}`;
      taskObj.completed = true;
    }
    return snapshotTask(taskId);
  }
}

app.get('/api/official-sources', (req, res) => {
  res.json({ success: true, ...getOfficialSourcesStatus() });
});

app.get('/api/models/curated', (req, res) => {
  res.json({
    success: true,
    models: CURATED_MODELS,
    presets: Object.values(MODEL_PRESETS),
    envTier: MODEL_TIER,
    pricingUrl: 'https://openrouter.ai/models',
  });
});

/** Kvarvarande OpenRouter-kredit (kräver API-nyckel med rätt behörighet) */
app.get('/api/openrouter/credits', async (req, res) => {
  const apiKey =
    process.env.OPENROUTER_MANAGEMENT_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    return res.json({ success: false, available: false, message: 'OPENROUTER_API_KEY saknas' });
  }
  try {
    const r = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      const text = await r.text();
      return res.json({
        success: false,
        available: false,
        message:
          r.status === 401 || r.status === 403
            ? 'Kredit-API kräver ofta Management-nyckel (openrouter.ai/settings/keys)'
            : `OpenRouter ${r.status}: ${text.slice(0, 120)}`,
      });
    }
    const data = await r.json();
    const total = data.data?.total_credits ?? data.total_credits ?? 0;
    const used = data.data?.total_usage ?? data.total_usage ?? 0;
    const remaining = Math.max(0, total - used);
    return res.json({
      success: true,
      available: true,
      totalCredits: total,
      totalUsage: used,
      remainingCredits: remaining,
      currency: 'USD',
      note: 'Visa aktuella modellpriser på openrouter.ai/models',
    });
  } catch (err) {
    res.json({ success: false, available: false, message: err.message });
  }
});

/** Lokal/admin: ladda ner stiftelseregister (~22 MB). Tar 1–3 min. */
app.post('/api/admin/sync-stiftelser', async (req, res) => {
  try {
    const result = await downloadStiftelseRegister();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/search-grants', async (req, res) => {
  const { targetCount = 8, searchMode = 'standard' } = req.body;
  const steps = EXA_API_KEY ? exaStepsForMode(searchMode, targetCount) : 0;
  const taskId = `search-${Date.now()}`;
  discoveryTasks.set(taskId, {
    id: taskId,
    status: 'Startar sökning...',
    logs: [],
    result: null,
    searchSteps: [],
    completed: false,
  });

  if (useInlineGrantSearch()) {
    try {
      const done = await executeGrantSearchTask(taskId, req.body, steps);
      if (!done?.result) {
        return res.status(500).json({ success: false, error: done?.status || 'Sökningen misslyckades' });
      }
      return res.json({
        success: true,
        output: done.result,
        searchSteps: done.searchSteps,
        warning: done.warning,
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  res.json({ success: true, taskId });
  executeGrantSearchTask(taskId, req.body, steps);
});

app.post('/api/discover-grants', async (req, res) => {
  const taskId = `disc-${Date.now()}`;
  discoveryTasks.set(taskId, {
    id: taskId, status: 'Startar...', logs: [], result: null, completed: false,
  });
  res.json({ success: true, taskId });

  (async () => {
    try {
      const { query = 'finansiering projektmedel 2026 riskkapital AI', orgProfile, modelSettings } = req.body;
      const orgName = orgProfile?.name || 'Vår organisation';

      updateTaskStatus(taskId, `Planerar sökstrategi för ${orgName} via Azure...`);

      const planPrompt = `Du är en expert på finansiering för AI-projekt. Organisation: ${orgName}. De söker kapital.
Skapa 3 distinkta sökfraser för att hitta utlysningar eller riskkapital.
Returnera ENDAST en JSON-array med 3 korta söksträngar (plain text, INTE objekt).
Exempel: ["Vinnova utlysningar AI 2026", "Riskkapital seed AI startups Sverige", "Tillväxtverket digitaliseringsstöd SMF 2026"]
Svar ENDAST JSON-arrayen:`;

      const planText = await generateWithFallback(planPrompt, 'reason', modelSettings);
      let searchSteps = [];
      try {
        const jsonMatch = planText.match(/\[[\s\S]*\]/);
        searchSteps = JSON.parse(jsonMatch ? jsonMatch[0] : planText);
        if (!Array.isArray(searchSteps) || searchSteps.length === 0) throw new Error('No steps');
        searchSteps = searchSteps.map(s =>
          typeof s === 'string' ? s : (s.sökterm || s.instruktion || s.query || s.step || JSON.stringify(s))
        );
      } catch (e) {
        searchSteps = [
          'Vinnova utlysningar AI digitalisering 2026',
          'Riskkapital seed investeringar AI Sverige 2026',
          'Tillväxtverket digitaliseringsstöd AI SMF 2026',
        ];
      }

      updateTaskStatus(taskId, `Sökplan: ${searchSteps.length} steg. Startar Exa-sökning...`);

      const allResults = [];
      for (let i = 0; i < searchSteps.length; i++) {
        const step = searchSteps[i];
        updateTaskStatus(taskId, `Steg ${i + 1}/${searchSteps.length}: ${step}`);
        try {
          const result = await runExaSearch(step, taskId);
          allResults.push({ step, output: result.output.substring(0, 3000) });
          updateTaskStatus(taskId, `✓ Steg ${i + 1} klar.`);
        } catch (err) {
          updateTaskStatus(taskId, `⚠ Steg ${i + 1} misslyckades: ${err.message}`);
          allResults.push({ step, output: '', error: err.message });
        }
      }

      updateTaskStatus(taskId, 'Syntetiserar resultat via Azure...');

      const synthesisInput = JSON.stringify(
        allResults.map(r => ({ step: r.step, output: r.output?.substring(0, 1000) })), null, 1
      );

      const synthesisPrompt = `Du är en expert som hjälper ${orgName} att hitta finansiering för AI.
Rådata från webbsökningar:
${synthesisInput}

Sammanställ en lista på 6-8 konkreta utlysningar eller riskkapitalmöjligheter för 2026.
Använd EXAKT detta format:

## [Namn på utlysningen]
- **Finansiär**: [Namn]
- **Deadline**: [Datum YYYY-MM-DD eller Löpande]
- **Maxbelopp**: [Summa]
- **Beskrivning**: [2-3 meningar]
- **Relevans**: [Varför passar detta?]
- **URL**: [https://...]`;

      const finalOutput = await generateWithFallback(synthesisPrompt, 'pro', modelSettings);
      updateTaskStatus(taskId, '✓ Discovery slutförd!');

      const taskObj = discoveryTasks.get(taskId);
      if (taskObj) {
        taskObj.result = finalOutput;
        taskObj.completed = true;
        taskObj.status = 'Klar!';
      }
    } catch (error) {
      const taskObj = discoveryTasks.get(taskId);
      if (taskObj) {
        taskObj.status = `Fel: ${error.message}`;
        taskObj.completed = true;
      }
    }
  })();
});

app.get('/api/discovery-status/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = discoveryTasks.get(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

app.post('/api/deep-search', async (req, res) => {
  const { targetCount = 12, searchMode = 'broad' } = req.body;
  const steps = EXA_API_KEY ? exaStepsForMode(searchMode, targetCount) : 0;
  const taskId = `deep-${Date.now()}`;
  discoveryTasks.set(taskId, {
    id: taskId,
    status: 'Startar djupsökning...',
    logs: [],
    result: null,
    searchSteps: [],
    completed: false,
  });

  if (useInlineGrantSearch()) {
    try {
      const done = await executeGrantSearchTask(taskId, req.body, steps);
      if (!done?.result) {
        return res.status(500).json({ success: false, error: done?.status || 'Djupsökning misslyckades' });
      }
      return res.json({
        success: true,
        synthesis: done.result,
        output: done.result,
        searchSteps: done.searchSteps,
        warning: done.warning,
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  res.json({ success: true, taskId });
  executeGrantSearchTask(taskId, req.body, steps);
});

app.post('/api/export-grants-pdf', async (req, res) => {
  try {
    const { grants = [], title = 'Utlysningar', orgName = '' } = req.body;
    if (!Array.isArray(grants) || grants.length === 0) {
      return res.status(400).json({ error: 'Inga utlysningar att exportera' });
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="utlysningar-${Date.now()}.pdf"`);
      res.send(pdf);
    });

    doc.fontSize(18).font('Helvetica-Bold').text(title, { align: 'center' });
    if (orgName) doc.fontSize(10).font('Helvetica').text(orgName, { align: 'center' });
    doc.fontSize(9).text(`${grants.length} utlysningar · ${new Date().toLocaleDateString('sv-SE')}`, { align: 'center' });
    doc.moveDown(1.5);

    grants.forEach((g, i) => {
      if (doc.y > 700) doc.addPage();
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#111').text(`${i + 1}. ${g.name || 'Namnlös'}`);
      doc.fontSize(9).font('Helvetica').fillColor('#333');
      if (g.funder) doc.text(`Finansiär: ${g.funder}`);
      if (g.deadline) doc.text(`Deadline: ${g.deadline}`);
      if (g.maxAmount) doc.text(`Belopp: ${g.maxAmount}`);
      if (g.url) doc.fillColor('#0645ad').text(g.url, { link: g.url, underline: true });
      doc.fillColor('#333');
      if (g.description) doc.text(g.description.substring(0, 400), { lineGap: 1 });
      doc.moveDown(0.8);
    });

    doc.fontSize(8).fillColor('#888').text('Genererad av AnslagSITK', 50, doc.page.height - 50, { align: 'center' });
    doc.end();
  } catch (error) {
    console.error('export-grants-pdf:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Djupanalys av en utlysning: liknande beviljade projekt, krav, tips
app.post('/api/grant-intelligence', async (req, res) => {
  try {
    const { grantInfo, orgProfile, modelSettings } = req.body;
    if (!grantInfo?.name) {
      return res.status(400).json({ error: 'grantInfo.name krävs' });
    }

    const funder = grantInfo.funder || 'finansiär';
    const orgName = orgProfile?.name || 'sökande organisation';
    const orgDesc = orgProfile?.description || '';

    const searchQueries = [
      `${funder} beviljade projekt lista exempel Sverige`,
      `${grantInfo.name} tidigare beviljade mottagare projekt`,
      `${funder} utlysning krav villkor ansökan ${grantInfo.name}`,
    ];

    const exaResults = [];
    for (const q of searchQueries) {
      try {
        const r = await runExaSearch(q);
        exaResults.push({ query: q, output: (r.output || '').substring(0, 2800) });
      } catch (err) {
        exaResults.push({ query: q, output: '', error: err.message });
      }
    }

    const synthesisPrompt = `Du är expert på svenska anslag och hjälper "${orgName}" (${orgDesc}) att förstå en utlysning.

UTLYSNING:
${JSON.stringify(grantInfo, null, 2)}

WEBBSÖKNING (rådata):
${JSON.stringify(exaResults, null, 1)}

Analysera och returnera ENDAST giltig JSON (inga markdown-kodblock) med denna struktur:
{
  "funderProfile": "2-4 meningar om finansiärens fokus och hur de brukar fördela medel",
  "similarProjects": [
    {
      "projectName": "string",
      "organization": "string",
      "year": "YYYY eller okänt",
      "amount": "belopp eller okänt",
      "summary": "1-2 meningar vad projektet gjorde",
      "url": "https://... eller tom sträng"
    }
  ],
  "eligibilityNotes": "Viktiga krav och vem som kan söka (punktlista som en sträng med \\n)",
  "applicationTips": "Konkreta tips för en stark ansökan till just denna utlysning",
  "commonPitfalls": "Vanliga misstag eller avslagsorsaker",
  "fitForOrg": "Hur väl ${orgName} matchar — ärlig bedömning med motivering"
}

Regler:
- similarProjects: 3-6 exempel om möjligt; hitta från sökdata. Om osäkert, markera tydligt i summary.
- Skriv på svenska.
- Bara verkliga URL:er från sökresultaten.`;

    const raw = await generateWithFallback(synthesisPrompt, 'pro', modelSettings);
    let parsed;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    } catch {
      parsed = {
        funderProfile: raw,
        similarProjects: [],
        eligibilityNotes: '',
        applicationTips: '',
        commonPitfalls: '',
        fitForOrg: '',
        rawSynthesis: raw,
      };
    }

    if (isQdrantConfigured()) {
      MemoryService.syncToQdrant(
        'memory-grants',
        `Utlysning: ${grantInfo.name} (${funder}). ${parsed.fitForOrg || ''}`,
        { grantId: grantInfo.id, funder, type: 'grant-intelligence' }
      ).catch(() => {});
    }

    res.json({
      success: true,
      grantName: grantInfo.name,
      funder,
      searchQueries,
      ...parsed,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-proposals', async (req, res) => {
  try {
    const { grantInfo, orgProfile, count = 3, modelSettings } = req.body;
    const prompt = `Skapa ${count} olika unika projektförslag (ProjectInfo) för: ${orgProfile.name}.
Organisationens beskrivning: ${orgProfile.description}
Utlysning/Finansiär: ${JSON.stringify(grantInfo, null, 2)}

Returnera ENDAST en JSON-array med ${count} objekt som matchar detta exakta gränssnitt:
{
  "title": "String",
  "description": "String",
  "goals": "String",
  "targetGroup": "String",
  "budget": "String",
  "timeline": "String",
  "partners": ["Partner 1", "Partner 2"]
}`;
    const text = await generateWithFallback(prompt, 'pro', modelSettings);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const proposals = JSON.parse(jsonMatch ? jsonMatch[0] : '[]');
    res.json({ success: true, proposals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-application', async (req, res) => {
  try {
    const { grantInfo, projectInfo, orgProfile, modelSettings } = req.body;
    const prompt = `Skriv ett professionellt ansökningsutkast för ${orgProfile?.name || 'organisationen'}.
Organisation: ${JSON.stringify(orgProfile, null, 2)}
UTLYSNING: ${JSON.stringify(grantInfo, null, 2)}
PROJEKTINFO: ${JSON.stringify(projectInfo, null, 2)}

Returnera ett JSON-objekt med dessa fält EXAKT (för React-klienten):
{
  "summary": "Sammanfattning...",
  "projectDescription": "Projektbeskrivning...",
  "goals": "Mål och förväntade resultat...",
  "implementation": "Genomförandeplan...",
  "budget": "Budget...",
  "competence": "Organisationens kompetens...",
  "dissemination": "Nyttjanderätt och spridning..."
}`;

    const text = await generateWithFallback(prompt, 'pro', modelSettings);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const content = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
    res.json({ success: true, content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- PDF-generering ---
app.post('/api/generate-pdf', async (req, res) => {
  try {
    const { draft, entity } = req.body;
    if (!draft?.content) return res.status(400).json({ error: 'Saknar ansökningsdata' });

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 60, right: 60 },
      info: {
        Title: `Ansökan - ${draft.projectInfo?.title || 'Projektansökan'}`,
        Author: entity?.name || 'AnslagSITK',
      },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ansokan-${draft.id || Date.now()}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(11).font('Helvetica').fillColor('#444')
       .text(entity?.name || 'Sökande organisation', { align: 'right' });
    if (entity?.orgNr) doc.fontSize(9).text(`Org.nr: ${entity.orgNr}`, { align: 'right' });
    if (entity?.phone) doc.fontSize(9).text(`Tel: ${entity.phone}`, { align: 'right' });
    doc.moveDown(1);

    // Title
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#1a1a1a')
       .text(draft.projectInfo?.title || 'Projektansökan', { align: 'center' });
    doc.moveDown(1);

    // Horizontal line
    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke('#ccc');
    doc.moveDown(1);

    const sections = [
      { title: 'Sammanfattning', content: draft.content.summary },
      { title: 'Projektbeskrivning', content: draft.content.projectDescription },
      { title: 'Mål och förväntade resultat', content: draft.content.goals },
      { title: 'Genomförandeplan', content: draft.content.implementation },
      { title: 'Budget', content: draft.content.budget },
      { title: 'Organisationens kompetens', content: draft.content.competence },
      { title: 'Nyttjanderätt och spridning', content: draft.content.dissemination },
    ];

    for (const section of sections) {
      if (!section.content) continue;
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#1a1a1a').text(section.title);
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor('#333').text(section.content, { lineGap: 2 });
      doc.moveDown(1);
    }

    doc.moveDown(1);
    doc.moveTo(60, doc.y).lineTo(535, doc.y).stroke('#ccc');
    doc.moveDown(0.5);
    doc.fontSize(8).font('Helvetica').fillColor('#999')
       .text(`Genererad av AnslagSITK • ${new Date().toLocaleDateString('sv-SE')}`, { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('PDF error:', error.message);
    res.status(500).json({ error: 'Kunde inte generera PDF' });
  }
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
  app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}

// Lokalt: starta server. Vercel: export-only (ingen listen)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    const activeZones = LLM_ZONES.filter(z => z.client).length;
    console.log(`✅ AnslagSITK backend på port ${PORT}`);
    console.log(`🔵 OpenRouter: ${activeZones}/${LLM_ZONES.length} zoner (${usesSharedKeyOnly ? 'delad nyckel' : 'multi-key'})`);
    if (activeZones === 0) console.warn('⚠ VARNING: Ingen OpenRouter API-nyckel konfigurerad!');
    console.log(`🏢 Entiteter: ${FUNDING_ENTITIES.map(e => e.name).join(', ')}`);
    console.log(`📂 GitHub Archive: ${ARCHIVE_PATH} (${fs.existsSync(ARCHIVE_PATH) ? 'hittad' : 'saknas'})`);
    console.log(`🔍 Search: ${EXA_API_KEY ? 'Exa live search' : 'LLM fallback (no Exa key)'}`);
  });
}

export default app;
