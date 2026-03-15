import { GoogleGenerativeAI } from '@google/generative-ai';
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

// ====================
// AI Model Setup
// ====================
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');
const modelPro = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
const modelFlash = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
const modelFallback = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

async function generateWithFallback(primaryModel, prompt, fallbackModel) {
  try {
    const result = await primaryModel.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.warn(`Primary model failed (${err.message}), trying fallback...`);
    const result = await fallbackModel.generateContent(prompt);
    return result.response.text();
  }
}

// ====================
// Discovery Task Queue
// ====================
const discoveryTasks = new Map();

function updateTaskStatus(taskId, message) {
  const task = discoveryTasks.get(taskId);
  if (task) {
    task.status = message;
    task.logs.push({ timestamp: new Date().toISOString(), message });
    console.log(`[Task ${taskId}] ${message}`);
  }
}

// ====================
// Google Search via Gemini Grounding
// (Replaces Browser Use — free, built-in, no credits needed)
// ====================

// Model with Google Search Grounding enabled
const modelSearch = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  tools: [{ googleSearch: {} }],
});

/**
 * Uses Gemini + Google Search Grounding to research a topic.
 * Returns the grounded text response with real search citations.
 */
async function runGoogleSearch(query, taskId = null) {
  const logMsg = `🔍 Söker: "${query.substring(0, 80)}..."`;
  if (taskId) updateTaskStatus(taskId, logMsg);
  console.log(logMsg);

  try {
    const result = await modelSearch.generateContent(
      `Du är en researcher specialiserad på svenska forskningsanslag.
Sök information om: ${query}
Fokusera på utlysningar och projektmedel för 2026.
Inkludera konkreta detaljer: finansiär, deadline, belopp, URL.
Svara kortfattat och strukturerat på svenska.`
    );
    const text = result.response.text();
    console.log(`✓ Google Search klar (${text.length} tecken)`);
    return { output: text };
  } catch (err) {
    console.error('Google Search Grounding failed:', err.message);
    throw err;
  }
}


// ====================
// HEALTH CHECK
// ====================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    geminiKey: !!process.env.GOOGLE_GEMINI_API_KEY,
    browserUseKey: !!process.env.BROWSER_USE_API_KEY,
  });
});

// ====================
// AUTHENTICATION
// ====================
const ADMIN_USERNAME = 'sitk_admin';
const ADMIN_PASSWORD = 'Sandviken2024!';

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    res.json({ success: true, token: 'sitk-auth-token-v1', user: { name: 'SITK Admin', role: 'admin' } });
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
    res.json({ user: { name: 'SITK Admin', role: 'admin' } });
  } else {
    res.status(401).json({ error: 'Inte inloggad' });
  }
});

// ====================
// GRANT SEARCH
// ====================
app.post('/api/search-grants', async (req, res) => {
  try {
    const { query, filters } = req.body;

    const prompt = `Du är en assistent som hittar svenska forskningsanslag och projektmedel för Sandvikens IT Kår (SITK).
Sök efter utlysningar relaterade till: "${query}"
${filters?.category ? `Kategori: ${filters.category}` : ''}

Returnera 3-5 relevanta utlysningar i detta exakta format:

## [Namn på utlysningen]
- **Finansiär**: [Namn]
- **Deadline**: [Datum]
- **Maxbelopp**: [Summa]
- **Beskrivning**: [Kort beskrivning]
- **Relevans**: [Varför passar detta SITK?]
- **URL**: [https://...]`;

    const text = await generateWithFallback(modelFlash, prompt, modelFallback);
    res.json({ output: text });
  } catch (error) {
    console.error('Search grants error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ====================
// LEAD DISCOVERY (async with polling)
// ====================
app.post('/api/discover-grants', async (req, res) => {
  const taskId = `disc-${Date.now()}`;
  discoveryTasks.set(taskId, {
    id: taskId,
    status: 'Startar...',
    logs: [],
    result: null,
    completed: false,
  });

  // Respond immediately with task ID so UI can start polling
  res.json({ success: true, taskId });

  // Run async in background
  (async () => {
    try {
      const { query = 'finansiering projektmedel 2026' } = req.body;

      // Load memory context
      let durableMemory = '';
      let agentDirectives = '';
      try {
        durableMemory = await MemoryService.readFile('MEMORY.md') || '';
        agentDirectives = await MemoryService.readFile('AGENTS.md') || '';
      } catch (e) {
        console.warn('Could not load memory files:', e.message);
      }

      await MemoryService.logEpisodic(`Startad ny lead discovery: "${query}"`);
      updateTaskStatus(taskId, 'Planerar sökstrategi baserat på SITK-kontext...');

      // Step 1: Plan search steps with Gemini
      const memContext = durableMemory ? `\n\nKännedom om SITK:\n${durableMemory.substring(0, 1000)}` : '';
      const planPrompt = `Du är en expert på svenska finansieringsanslag. Sandvikens IT Kår (SITK) söker nya projektmedel för 2026.
${memContext}

Skapa 3 specifika och distinkta sökinstruktioner för att hitta nischade utlysningar.
Fokusera på: Vinnova, Tillväxtverket, Region Gävleborg, EU-medel, Arvsfonden.
Returnera ENDAST en JSON-array med strängar, inget annat.
Exempel: ["Sök Vinnova utlysningar AI 2026", "Hitta Tillväxtverket digitaliseringsstöd SMF"]`;

      updateTaskStatus(taskId, 'Genererar sökplan med Gemini...');
      const planText = await generateWithFallback(modelFlash, planPrompt, modelFallback);

      let searchSteps = [];
      try {
        const jsonMatch = planText.match(/\[[\s\S]*\]/);
        searchSteps = JSON.parse(jsonMatch ? jsonMatch[0] : planText);
        if (!Array.isArray(searchSteps) || searchSteps.length === 0) throw new Error('No steps');
      } catch (e) {
        searchSteps = [
          'Sök Vinnova utlysningar AI digitalisering offentlig sektor 2026',
          'Hitta Tillväxtverket regionalfond projektmedel Norra Mellansverige 2026',
          'Region Gävleborg innovationsstöd SMF 2026',
        ];
      }

      updateTaskStatus(taskId, `Sökplan skapad: ${searchSteps.length} steg. Startar webbsökning...`);

      // Step 2: Execute browser searches
      const allResults = [];
      for (let i = 0; i < searchSteps.length; i++) {
        const step = searchSteps[i];
        updateTaskStatus(taskId, `Steg ${i + 1}/${searchSteps.length}: ${step}`);
        try {
          const browserResult = await runGoogleSearch(step, taskId);
          const output = browserResult.output || '';
          allResults.push({ step, output: output.substring(0, 3000) });
          updateTaskStatus(taskId, `✓ Steg ${i + 1} klar. Hittade ${output.length} tecken rådata.`);
        } catch (err) {
          updateTaskStatus(taskId, `⚠ Steg ${i + 1} misslyckades: ${err.message}`);
          allResults.push({ step, output: '', error: err.message });
        }
      }

      // Step 3: Synthesize results
      updateTaskStatus(taskId, 'Syntetiserar resultat med Gemini...');

      const hasRealData = allResults.some(r => r.output && r.output.length > 50);
      let synthesisInput = '';
      if (hasRealData) {
        synthesisInput = `Rådata från webbsökningar:\n${JSON.stringify(allResults.map(r => ({ step: r.step, output: r.output?.substring(0, 1000) })), null, 1)}`;
      } else {
        synthesisInput = `Webbsökning gav inga resultat. Använd din kunskap om svenska anslag för att lista realistiska utlysningar.`;
      }

      const synthesisPrompt = `Du är en expert som hjälper Sandvikens IT Kår (SITK) att hitta finansiering.
${synthesisInput}

Sammanställ en lista på 6-8 konkreta och UNIKA utlysningar för 2026.
Varje utlysning SKA ha en giltig URL till finansiärens officiella webbplats.

Använd EXAKT detta format för varje utlysning:

## [Namn på utlysningen]
- **Finansiär**: [Namn]
- **Deadline**: [Datum YYYY-MM-DD]
- **Maxbelopp**: [Summa i kr]
- **Beskrivning**: [2-3 meningar om utlysningen]
- **Relevans**: [Varför passar detta SITK?]
- **URL**: [https://officiell-url.se]

Skriv på professionell svenska. Inkludera verkliga URLs till vinnova.se, tillvaxtverket.se, regiongavleborg.se, etc.`;

      const finalOutput = await generateWithFallback(modelFlash, synthesisPrompt, modelFallback);

      updateTaskStatus(taskId, '✓ Discovery slutförd! Bearbetar resultat...');

      const taskObj = discoveryTasks.get(taskId);
      if (taskObj) {
        taskObj.result = finalOutput;
        taskObj.completed = true;
        taskObj.status = 'Klar!';
      }

      // Log to episodic memory
      try {
        await MemoryService.logEpisodic(`Lead discovery slutförd för "${query}"`, {
          stepsRun: searchSteps.length,
          hasRealData,
          outputLength: finalOutput.length,
        });
        await MemoryService.writeFile('WORKING.md', `---
last_updated: ${new Date().toISOString()}
---
# Working Memory
Slutförde lead discovery run för "${query}".
Steg körda: ${searchSteps.length}
Webb-data: ${hasRealData ? 'Ja' : 'Fallback till Gemini-kunskap'}
Nästa steg: Analysera specifika utlysningar vid förfrågan.`);
      } catch (e) {
        console.warn('Could not write memory files:', e.message);
      }

    } catch (error) {
      console.error('Discovery background error:', error);
      const taskObj = discoveryTasks.get(taskId);
      if (taskObj) {
        taskObj.status = `Fel: ${error.message}`;
        taskObj.completed = true;
      }
    }
  })();
});

// Poll for discovery status
app.get('/api/discovery-status/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = discoveryTasks.get(taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.json(task);
});

// ====================
// DEEP SEARCH
// ====================
app.post('/api/deep-search', async (req, res) => {
  try {
    const { query } = req.body;

    const planPrompt = `Skapa en sökplan för: "${query}" för Sandvikens IT Kår (SITK).
Returnera ENDAST en JSON-array med 3 sökinstruktioner som strängar.`;

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

    const synthesisPrompt = `Sammanställ dessa sökresultat för SITK om: "${query}"
${JSON.stringify(results)}
Formatera som ## [Namn] lista med tydliga leads. Skriv på svenska.`;

    const synthesisText = await generateWithFallback(modelFlash, synthesisPrompt, modelFallback);

    res.json({ success: true, plan: searchSteps, rawResults: results, synthesis: synthesisText });
  } catch (error) {
    console.error('Deep search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ====================
// SEARCH PROXY (formerly Browser Use)
// ====================
app.post('/api/browser-use/run', async (req, res) => {
  try {
    const data = await runGoogleSearch(req.body.task);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====================
// APPLICATION GENERATION
// ====================
app.post('/api/generate-application', async (req, res) => {
  try {
    const { grantInfo, projectInfo } = req.body;
    const prompt = `Skriv ett professionellt ansökningsutkast för Sandvikens IT Kår.

UTLYSNING: ${JSON.stringify(grantInfo, null, 2)}
PROJEKTINFO: ${JSON.stringify(projectInfo, null, 2)}

Returnera ett JSON-objekt med dessa fält:
{
  "summary": "Kort sammanfattning",
  "goals": ["Mål 1", "Mål 2"],
  "activities": ["Aktivitet 1", "Aktivitet 2"],
  "budget": "Budgetöversikt",
  "timeline": "Tidslinje",
  "impact": "Förväntad effekt",
  "mainText": "Fullständig ansökningstext på 3-5 stycken"
}`;

    const text = await generateWithFallback(modelPro, prompt, modelFallback);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const content = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    res.json({ success: true, content });
  } catch (error) {
    console.error('Application generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ====================
// MEMORY API
// ====================
app.get('/api/memory/logs', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const content = await MemoryService.readFile(`memory/${today}.md`);
    res.json({ content: content || '# Inga loggar för idag.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// IMPORTANT: This more specific route must come BEFORE the generic :filename route
app.post('/api/memory/search', async (req, res) => {
  try {
    const results = await MemoryService.searchMemory(req.body.query, req.body.collection);
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/memory/:filename', async (req, res) => {
  try {
    const content = await MemoryService.readFile(req.params.filename);
    if (content === null) return res.status(404).json({ error: 'File not found' });
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/memory/:filename', async (req, res) => {
  try {
    await MemoryService.writeFile(req.params.filename, req.body.content);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====================
// STATIC FILES (Production)
// ====================
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });
}

// ====================
// START SERVER
// ====================
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`   Gemini API: ${process.env.GOOGLE_GEMINI_API_KEY ? '✓ configured' : '✗ MISSING'}`);
  console.log(`   Browser Use: ${process.env.BROWSER_USE_API_KEY ? '✓ configured' : '✗ MISSING'}`);
});

export default app;
