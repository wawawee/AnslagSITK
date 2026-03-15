import { MemoryService } from './services/memoryService.js';

// ... existing code ...

// Endpoint to get a memory file
app.get('/api/memory/:filename', async (req, res) => {
  try {
    const content = await MemoryService.readFile(req.params.filename);
    if (content === null) return res.status(404).json({ error: 'File not found' });
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to update a memory file
app.post('/api/memory/:filename', async (req, res) => {
  try {
    await MemoryService.writeFile(req.params.filename, req.body.content);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to search memory
app.post('/api/memory/search', async (req, res) => {
  try {
    const results = await MemoryService.searchMemory(req.body.query, req.body.collection);
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to list recent logs
app.get('/api/memory/logs', async (req, res) => {
  try {
    // For now, return the current day's log content as a simplified list
    const today = new Date().toISOString().split('T')[0];
    const content = await MemoryService.readFile(`memory/${today}.md`);
    res.json({ content: content || '# Inga loggar för idag än.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Specialized discovery endpoint with multi-step research loop
app.post('/api/discover-grants', async (req, res) => {
  const taskId = `disc-${Date.now()}`;
  discoveryTasks.set(taskId, {
    id: taskId,
    status: 'Initializing',
    logs: [],
    result: null,
    completed: false
  });

  // Run in "background" and return taskId
  (async () => {
    try {
      const { query } = req.body;

      // Inject knowledge from durable memory
      const durableMemory = await MemoryService.readFile('MEMORY.md');
      const agentDirectives = await MemoryService.readFile('AGENTS.md');

      await MemoryService.logEpisodic(`Startad ny lead discovery: "${query}"`);
      updateTaskStatus(taskId, 'Planerar sökstrategi baserat på AGENTS.md och MEMORY.md...');

      // Step 1: Planning
      const planPrompt = `Du är en expert på att hitta nischade och regionala forskningsanslag i Sverige.
Här är dina instruktioner (AGENTS.md):
${agentDirectives}

Här är din kännedom om SITK (MEMORY.md):
${durableMemory}

Användaren vill hitta FLER leads för projektmedel med start eller huvudfokus på 2026.
Skapa en sökplan med 4 specifika, distinkta sökinstruktioner.
Returnera instruktionerna som en JSON-array med strängar. Var så specifik som möjligt.`;

      const planText = await generateWithFallback(modelPro, planPrompt, modelFallback);
      let searchSteps = [];
      try {
        const jsonMatch = planText.match(/\[.*\]/s);
        searchSteps = JSON.parse(jsonMatch ? jsonMatch[0] : planText);
      } catch (e) {
        searchSteps = ["Sök regionala projektmedel Gävleborg 2026", "Leta Vinnova AI utlysningar 2026"];
      }

      updateTaskStatus(taskId, `Sökplan skapad med ${searchSteps.length} steg.`);
      await MemoryService.logEpisodic(`Sökplan skapad`, { steps: searchSteps });

      // Step 2: Execution
      const allResults = [];
      for (let i = 0; i < searchSteps.length; i++) {
        const step = searchSteps[i];
        updateTaskStatus(taskId, `Steg ${i+1}/${searchSteps.length}: ${step}`);
        try {
          const browserResult = await runBrowserCommand(step, taskId);
          allResults.push({ step, output: browserResult.output || browserResult.result || '' });
          updateTaskStatus(taskId, `Steg ${i+1} slutfört.`);
          await MemoryService.logEpisodic(`Genomfört söksteg: ${step}`, { status: 'success' });
        } catch (err) {
          updateTaskStatus(taskId, `Varning: Steg ${i+1} misslyckades: ${err.message}`);
          await MemoryService.logEpisodic(`Söksteg misslyckades: ${step}`, { error: err.message });
        }
      }

      // Step 3: Synthesis
      updateTaskStatus(taskId, 'Syntetiserar och sammanställer unika leads...');
      const synthesisPrompt = `Du har genomfört en omfattande sökning efter nya projektmedel för 2026 för SITK.
Context (MEMORY.md): ${durableMemory}
Här är rådata från flera sökningar:
${JSON.stringify(allResults, null, 2)}

Sammanställ en lista på 6-12 UNIKA och DEFINITIVA utlysningar.
Varje utlysning MÅSTE ha en giltig käll-URL.
Använd exakt detta format:

## [Namn på utlysningen]
- **Finansiär**: [Namn]
- **Deadline**: [Datum]
- **Maxbelopp**: [Summa]
- **Beskrivning**: [Beskrivning]
- **Relevans**: [Varför SITK?]
- **URL**: [Direktlänk]

Skriv på professionell svenska.`;

      const finalOutput = await generateWithFallback(modelFlash, synthesisPrompt, modelFallback);

      const taskObj = discoveryTasks.get(taskId);
      taskObj.result = finalOutput;
      taskObj.completed = true;
      updateTaskStatus(taskId, 'Discovery slutförd! Skickar resultat till tavlan.');

      // Update WORKING.md with the latest achievement
      await MemoryService.writeFile('WORKING.md', `---
last_updated: ${new Date().toISOString()}
---
# Working Memory
Slutförde lead discovery run för "${query}". Hittade nya leads som nu är integrerade.
Nästa steg: Analysera specifika utlysningar i detalj vid förfrågan.`);

      await MemoryService.logEpisodic(`Lead discovery slutförd för "${query}"`, { leadCount: '6-12 (synthesized)' });

    } catch (error) {
      console.error('Discovery error:', error);
      updateTaskStatus(taskId, `Fel vid discovery: ${error.message}`);
      const taskObj = discoveryTasks.get(taskId);
      if (taskObj) taskObj.completed = true;
      await MemoryService.logEpisodic(`Discovery kraschade`, { error: error.message });
    }
  })();

  res.json({ success: true, taskId });
});

// Other endpoints (Deep Search, etc.) - Simplified to keep consistent
app.post('/api/deep-search', async (req, res) => {
  try {
    const { query } = req.body;
    updateTaskStatus('system', `Djupsökning påbörjad: ${query}`);

    const planPrompt = `Skapa en sökplan för: "${query}" för Sandvikens IT Kår (SITK).
Returnera JSON-array med 3 sökinstruktioner.`;

    const planText = await generateWithFallback(modelPro, planPrompt, modelFallback);
    let searchSteps = [];
    try {
      const jsonMatch = planText.match(/\[.*\]/s);
      searchSteps = JSON.parse(jsonMatch ? jsonMatch[0] : planText);
    } catch (e) {
      searchSteps = [query];
    }

    const results = [];
    for (const step of searchSteps.slice(0, 3)) {
      try {
        const browserResult = await runBrowserCommand(step);
        results.push({ step, output: browserResult.output || browserResult.result || 'No results' });
      } catch (err) {
        results.push({ step, error: err.message });
      }
    }

    const synthesisPrompt = `Sammanställ resultaten för: "${query}"\n${JSON.stringify(results)}\nAnvänd ## [Namn] format.`;
    const synthesisText = await generateWithFallback(modelPro, synthesisPrompt, modelFallback);

    res.json({ success: true, plan: searchSteps, rawResults: results, synthesis: synthesisText });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Proxy endpoints for Browser Use API
app.post('/api/browser-use/run', async (req, res) => {
  try {
    const data = await runBrowserCommand(req.body.task);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-application', async (req, res) => {
  try {
    const { grantInfo, projectInfo, sitkProfile } = req.body;
    const prompt = `Skriv ett ansökningsutkast för Sandvikens IT Kår.\nUTLYSNING: ${JSON.stringify(grantInfo)}\nReturnera JSON med summary, goals, etc.`;
    const text = await generateWithFallback(modelPro, prompt, modelFallback);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const content = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    res.json({ success: true, content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve static files
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
