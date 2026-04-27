import OpenAI from 'openai';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { MemoryService } from './services/memoryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Azure AI Foundry Multi-Zone Setup ---
const mkClient = (endpoint, key) => new OpenAI({
  baseURL: endpoint,
  apiKey: key,
  defaultHeaders: { 'api-key': key },
});

const azureSweden = mkClient(process.env.AZURE_SWEDEN_OPENAI_ENDPOINT,  process.env.AZURE_SWEDEN_API_KEY);
const azureUSA    = mkClient(process.env.AZURE_USA_OPENAI_ENDPOINT,     process.env.AZURE_USA_API_KEY);
const azureWestUS = mkClient(process.env.AZURE_WESTUS_OPENAI_ENDPOINT,  process.env.AZURE_WESTUS_API_KEY);
const azureNorway = mkClient(process.env.AZURE_NORWAY_OPENAI_ENDPOINT,  process.env.AZURE_NORWAY_API_KEY);

// Zone map — each zone knows exactly which deployment name to use per task mode:
//   reason = planning / analytical tasks  (gpt-5.3 reasoning series)
//   pro    = synthesis / proposal writing (gpt-5.4 capable series)
//   fast   = light/quick tasks            (nano / mini)
const ZONE_MAP = [
  {
    name: 'Sweden Central', client: azureSweden,
    models: { reason: 'gpt-5.3-codex', pro: 'gpt-5.4-1',    fast: 'o4-mini' },
  },
  {
    name: 'East US 2',      client: azureUSA,
    models: { reason: 'o4-mini',        pro: 'gpt-5.4',      fast: 'o4-mini' },
  },
  {
    name: 'Norway East',    client: azureNorway,
    models: { reason: 'gpt-5.3-chat',   pro: 'gpt-5.4',      fast: 'gpt-5.4-nano' },
  },
  {
    name: 'West US 3',      client: azureWestUS,
    models: { reason: 'gpt-5.2-chat',   pro: 'gpt-5.2-chat', fast: 'gpt-4o' },
  },
];

async function azureChat(client, model, prompt, zone = 'unknown') {
  // o-series models use max_completion_tokens and don't support temperature
  const isOSeries = /^o\d/i.test(model);
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
async function generateWithFallback(prompt, mode = 'pro') {
  // backwards-compat: boolean true → 'pro', false → 'reason'
  if (mode === true)  mode = 'pro';
  if (mode === false) mode = 'reason';

  for (const zone of ZONE_MAP) {
    const model = zone.models[mode] || zone.models.pro;
    try {
      const result = await azureChat(zone.client, model, prompt, zone.name);
      console.log(`✅ Azure ${zone.name} [${mode}]: ${model}`);
      return result;
    } catch (err) {
      console.warn(`⚠ Azure ${zone.name} misslyckades: ${err.message} — provar nästa zon...`);
    }
  }
  throw new Error('Alla Azure-zoner misslyckades');
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
    // Fallback: låt Azure generera svar utan live-data
    const fallbackPrompt = `Du är en researcher om svenska anslag. Svara på frågan baserat på din kunskap om: ${query}. Fokusera på utlysningar 2025-2026. Ge konkreta finansiärer, belopp och URLer.`;
    const text = await generateWithFallback(fallbackPrompt, 'pro');
    return { output: text };
  }
}

// --- Task tracking ---
const discoveryTasks = new Map();

function updateTaskStatus(taskId, message) {
  const task = discoveryTasks.get(taskId);
  if (task) {
    task.status = message;
    task.logs.push({ timestamp: new Date().toISOString(), message });
    console.log(`[Task ${taskId}] ${message}`);
  }
}

// --- Routes ---

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    backend: 'Azure AI Foundry',
    zones: ZONE_MAP.map(z => ({ name: z.name, models: z.models })),
    search: EXA_API_KEY ? 'Exa (live)' : 'Azure fallback',
  });
});

app.post('/api/auth/login', (req, res) => {
  const ADMIN_USERNAME = 'sitk_admin';
  const ADMIN_PASSWORD = 'Sandviken2024!';
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
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

app.post('/api/search-grants', async (req, res) => {
  try {
    const { query, filters, orgProfile } = req.body;
    const orgName = orgProfile?.name || 'Vår organisation';
    const orgDesc = orgProfile?.description || '';

    const prompt = `Du är en assistent som hittar riskkapital, forskningsanslag och projektmedel för: ${orgName} - ${orgDesc}.
Sök efter utlysningar och riskkapital relaterade till: "${query}"
${filters?.category ? `Kategori: ${filters.category}` : ''}

Returnera 3-5 relevanta utlysningar i detta exakta format:

## [Namn på utlysningen]
- **Finansiär**: [Namn]
- **Deadline**: [Datum]
- **Maxbelopp**: [Summa]
- **Beskrivning**: [Kort beskrivning]
- **Relevans**: [Varför passar detta ${orgName}?]
- **URL**: [https://...]`;

    const text = await generateWithFallback(prompt, 'pro');
    res.json({ output: text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/discover-grants', async (req, res) => {
  const taskId = `disc-${Date.now()}`;
  discoveryTasks.set(taskId, {
    id: taskId, status: 'Startar...', logs: [], result: null, completed: false,
  });
  res.json({ success: true, taskId });

  (async () => {
    try {
      const { query = 'finansiering projektmedel 2026 riskkapital AI', orgProfile } = req.body;
      const orgName = orgProfile?.name || 'Vår organisation';

      updateTaskStatus(taskId, `Planerar sökstrategi för ${orgName} via Azure...`);

      const planPrompt = `Du är en expert på finansiering för AI-projekt. Organisation: ${orgName}. De söker kapital.
Skapa 3 distinkta sökfraser för att hitta utlysningar eller riskkapital.
Returnera ENDAST en JSON-array med 3 korta söksträngar (plain text, INTE objekt).
Exempel: ["Vinnova utlysningar AI 2026", "Riskkapital seed AI startups Sverige", "Tillväxtverket digitaliseringsstöd SMF 2026"]
Svar:`;

      const planText = await generateWithFallback(planPrompt, 'reason');
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

      const finalOutput = await generateWithFallback(synthesisPrompt, 'pro');
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
  try {
    const { query, orgProfile } = req.body;
    const planPrompt = `Skapa 3 söksträng-fraser för webbsökning om: "${query}".
Returnera ENDAST en JSON-array med 3 korta söksträngar (plain text, inte objekt).
Exempel: ["Vinnova FoU-stöd AI 2026", "Tillväxtverket startup bidrag Gävleborg", "EU Horisont innovation skatteåtervinning"]
Svar:`;
    const planText = await generateWithFallback(planPrompt, 'reason');

    let searchSteps = [];
    try {
      const jsonMatch = planText.match(/\[[\s\S]*\]/);
      searchSteps = JSON.parse(jsonMatch ? jsonMatch[0] : planText);
      searchSteps = searchSteps.map(s =>
        typeof s === 'string' ? s : (s.sökterm || s.instruktion || s.query || s.step || JSON.stringify(s))
      );
    } catch (e) {
      searchSteps = [query];
    }

    const results = [];
    for (const step of searchSteps.slice(0, 3)) {
      try {
        const result = await runExaSearch(String(step));
        results.push({ step, output: result.output?.substring(0, 2000) || 'Inga resultat' });
      } catch (err) {
        results.push({ step, output: '', error: err.message });
      }
    }

    const synthesisPrompt = `Sammanställ sökresultaten om: "${query}"
${JSON.stringify(results)}
Formatera som ## [Namn] lista med tydliga leads. Skriv på svenska. Inkludera deadlines och URLer.`;
    const synthesisText = await generateWithFallback(synthesisPrompt, 'pro');

    res.json({ success: true, plan: searchSteps, rawResults: results, synthesis: synthesisText });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-proposals', async (req, res) => {
  try {
    const { grantInfo, orgProfile, count = 3 } = req.body;
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
    const text = await generateWithFallback(prompt, 'pro');
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const proposals = JSON.parse(jsonMatch ? jsonMatch[0] : '[]');
    res.json({ success: true, proposals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-application', async (req, res) => {
  try {
    const { grantInfo, projectInfo, orgProfile } = req.body;
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

    const text = await generateWithFallback(prompt, 'pro');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const content = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
    res.json({ success: true, content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
  app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`✅ AnslagSITK backend på port ${PORT}`);
  console.log(`🔵 Azure AI Foundry: Sweden Central (primary) → East US 2 → West US 3`);
  console.log(`🔍 Search: ${EXA_API_KEY ? 'Exa live search' : 'Azure fallback (no Exa key)'}`);
});

export default app;
