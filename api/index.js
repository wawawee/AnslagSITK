import { VertexAI } from '@google-cloud/vertexai';
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

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PROJECT_ID = process.env.VERTEX_PROJECT || process.env.GCP_PROJECT_ID || 'taxrevision';
const LOCATION = process.env.VERTEX_LOCATION || process.env.GCP_LOCATION || 'global';

const vertexAI = new VertexAI({ 
    project: PROJECT_ID, 
    location: LOCATION, 
    apiEndpoint: 'aiplatform.googleapis.com' 
});

const modelPro = vertexAI.getGenerativeModel({ model: 'gemini-3.1-pro-preview' });
const modelFlash = vertexAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
const modelFallback = vertexAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

async function generateWithFallback(primaryModel, prompt, fallbackModel) {
  try {
    const result = await primaryModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    return result.response.candidates[0].content.parts[0].text;
  } catch (err) {
    console.warn(`Primary model failed (${err.message}), trying fallback...`);
    const result = await fallbackModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    return result.response.candidates[0].content.parts[0].text;
  }
}

const discoveryTasks = new Map();

function updateTaskStatus(taskId, message) {
  const task = discoveryTasks.get(taskId);
  if (task) {
    task.status = message;
    task.logs.push({ timestamp: new Date().toISOString(), message });
    console.log(`[Task ${taskId}] ${message}`);
  }
}

const modelSearch = vertexAI.getGenerativeModel({
  model: 'gemini-3-flash-preview',
  tools: [{ googleSearch: {} }],
});

async function runGoogleSearch(query, taskId = null) {
  const logMsg = `🔍 Söker: "${query.substring(0, 80)}..."`;
  if (taskId) updateTaskStatus(taskId, logMsg);
  console.log(logMsg);

  try {
    const prompt = `Du är en researcher specialiserad på svenska forskningsanslag och riskkapital för AI.
Sök information om: ${query}
Fokusera på utlysningar och projektmedel för 2026.
Inkludera konkreta detaljer: finansiär, deadline, belopp, URL.
Svara kortfattat och strukturerat på svenska.`;
    
    const result = await modelSearch.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });
    const text = result.response.candidates[0].content.parts[0].text;
    return { output: text };
  } catch (err) {
    console.error('Google Search Grounding failed:', err.message);
    throw err;
  }
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    vertexConfig: { project: PROJECT_ID, location: LOCATION }
  });
});

const ADMIN_USERNAME = 'sitk_admin';
const ADMIN_PASSWORD = 'Sandviken2024!';

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    res.json({ success: true, token: 'sitk-auth-token-v1', user: { name: 'Admin', role: 'admin' } });
  } else {
    res.status(401).json({ error: 'Ogiltiga inloggningsuppgifter' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ success: true });
});

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

    const text = await generateWithFallback(modelFlash, prompt, modelFallback);
    res.json({ output: text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/discover-grants', async (req, res) => {
  const taskId = `disc-${Date.now()}`;
  discoveryTasks.set(taskId, {
    id: taskId,
    status: 'Startar...',
    logs: [],
    result: null,
    completed: false,
  });

  res.json({ success: true, taskId });

  (async () => {
    try {
      const { query = 'finansiering projektmedel 2026 riskkapital AI', orgProfile } = req.body;
      const orgName = orgProfile?.name || 'Vår organisation';
      
      updateTaskStatus(taskId, `Planerar sökstrategi baserat på ${orgName}...`);

      const planPrompt = `Du är en expert på finansiering för AI-projekt. Organisation: ${orgName}. De söker kapital.
Skapa 3 specifika och distinkta sökinstruktioner för att hitta nischade utlysningar eller riskkapital.
Returnera ENDAST en JSON-array med strängar, inget annat.
Exempel: ["Sök Vinnova utlysningar AI 2026", "Riskkapital AI startups Sverige"]`;

      updateTaskStatus(taskId, 'Genererar sökplan med Gemini...');
      const planText = await generateWithFallback(modelFlash, planPrompt, modelFallback);

      let searchSteps = [];
      try {
        const jsonMatch = planText.match(/\[[\s\S]*\]/);
        searchSteps = JSON.parse(jsonMatch ? jsonMatch[0] : planText);
        if (!Array.isArray(searchSteps) || searchSteps.length === 0) throw new Error('No steps');
      } catch (e) {
        searchSteps = [
          'Sök Vinnova utlysningar AI digitalisering 2026',
          'Riskkapital seed investeringar AI Sverige 2026',
          'Tillväxtverket digitaliseringsstöd AI SMF 2026',
        ];
      }

      updateTaskStatus(taskId, `Sökplan skapad: ${searchSteps.length} steg. Startar webbsökning...`);

      const allResults = [];
      for (let i = 0; i < searchSteps.length; i++) {
        const step = searchSteps[i];
        updateTaskStatus(taskId, `Steg ${i + 1}/${searchSteps.length}: ${step}`);
        try {
          const browserResult = await runGoogleSearch(step, taskId);
          const output = browserResult.output || '';
          allResults.push({ step, output: output.substring(0, 3000) });
          updateTaskStatus(taskId, `✓ Steg ${i + 1} klar.`);
        } catch (err) {
          updateTaskStatus(taskId, `⚠ Steg ${i + 1} misslyckades: ${err.message}`);
          allResults.push({ step, output: '', error: err.message });
        }
      }

      updateTaskStatus(taskId, 'Syntetiserar resultat med Gemini...');

      const synthesisInput = `Rådata från webbsökningar:\n${JSON.stringify(allResults.map(r => ({ step: r.step, output: r.output?.substring(0, 1000) })), null, 1)}`;

      const synthesisPrompt = `Du är en expert som hjälper ${orgName} att hitta finansiering för AI.
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

      const finalOutput = await generateWithFallback(modelFlash, synthesisPrompt, modelFallback);
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
    const { query } = req.body;
    const planPrompt = `Skapa en sökplan för: "${query}". Returnera ENDAST en JSON-array med 3 sökinstruktioner.`;
    const planText = await generateWithFallback(modelFlash, planPrompt, modelFallback);
    let searchSteps = [];
    try {
      const jsonMatch = planText.match(/\[[\s\S]*\]/);
      searchSteps = JSON.parse(jsonMatch ? jsonMatch[0] : planText);
    } catch (e) {
      searchSteps = [query];
    }

    const results = [];
    for (const step of searchSteps.slice(0, 3)) {
      try {
        const browserResult = await runGoogleSearch(step);
        results.push({ step, output: browserResult.output?.substring(0, 2000) || 'Inga resultat' });
      } catch (err) {
        results.push({ step, output: '', error: err.message });
      }
    }

    const synthesisPrompt = `Sammanställ sökresultaten om: "${query}"
${JSON.stringify(results)}
Formatera som ## [Namn] lista med tydliga leads. Skriv på svenska.`;
    const synthesisText = await generateWithFallback(modelFlash, synthesisPrompt, modelFallback);

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
}
`;
    const text = await generateWithFallback(modelPro, prompt, modelFallback);
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

    const text = await generateWithFallback(modelPro, prompt, modelFallback);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const content = JSON.parse(jsonMatch ? jsonMatch[0] : '{}');
    res.json({ success: true, content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
  app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

export default app;
