import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Google Gemini configuration
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');

// Model IDs from 2026/SITK Standard
const MODEL_PRO = "gemini-3.1-pro-preview";
const MODEL_FLASH = "gemini-3-flash-preview";
const MODEL_FALLBACK = "gemini-flash-lite-latest";

const modelPro = genAI.getGenerativeModel({ model: MODEL_PRO });
const modelFlash = genAI.getGenerativeModel({ model: MODEL_FLASH });
const modelFallback = genAI.getGenerativeModel({ model: MODEL_FALLBACK });

// Helper for robust content generation with fallback
async function generateWithFallback(modelObj, prompt, fallbackModelObj) {
  try {
    const result = await modelObj.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.warn(`Primary model failed, falling back: ${err.message}`);
    if (fallbackModelObj) {
      const result = await fallbackModelObj.generateContent(prompt);
      return result.response.text();
    }
    throw err;
  }
}


// Browser Use API configuration
const BROWSER_USE_API_KEY = process.env.BROWSER_USE_API_KEY || 'bu_tGoTZEli69AWqEjxJFjDlF1eCiuEtXD0P1Gox9dsOFA';
const BROWSER_USE_BASE_URL = 'https://api.browser-use.com/api/v3';

// Helper to run browser task
async function runBrowserCommand(task) {
  const response = await axios.post(
    `${BROWSER_USE_BASE_URL}/run`,
    { task, model: MODEL_FLASH },
    {
      headers: {
        'x-api-key': BROWSER_USE_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data;
}


// Deep Search Endpoint utilizing Gemini + Browser Use
app.post('/api/deep-search', async (req, res) => {
  try {
    const { query } = req.body;

    // Step 1: Brain (Gemini 3.1 Pro) creates a research plan
    const planPrompt = `Du är en expert på att hitta forskningsanslag och projektmedel i Sverige.
Användaren vill hitta: "${query}" för Sandvikens IT Kår (SITK).

Skapa en detaljerad sökplan med 3 specifika sökinstruktioner för en webbläsar-agent som söker på svenska myndigheters och organisationers webbplatser.
Varje instruktion ska vara fokuserad på en specifik typ av källa (t.ex. Vinnova, Tillväxtverket, Region Gävleborg).
Returnera instruktionerna som en JSON-array med strängar. Exempel: ["Sök hos Vinnova efter...", "Kolla Tillväxtverkets utlysningar för...", "..."]`;

    const planText = await generateWithFallback(modelPro, planPrompt, modelFallback);
    let searchSteps = [];
    try {
      // Clean potential markdown formatting
      const jsonMatch = planText.match(/\[.*\]/s);
      searchSteps = JSON.parse(jsonMatch ? jsonMatch[0] : planText);
    } catch (e) {
      console.error('Failed to parse plan:', planText);
      searchSteps = [query]; // Fallback to just the query
    }

    // Step 2: Execution (Deep search loop)
    const results = [];
    for (const step of searchSteps.slice(0, 3)) { // Limit to 3 steps for now
      console.log(`Executing search step: ${step}`);
      try {
        const browserResult = await runBrowserCommand(step);
        results.push({ step, output: browserResult.output || browserResult.result || 'No results' });
      } catch (err) {
        console.error(`Browser task failed for step "${step}":`, err.message);
        results.push({ step, error: err.message });
      }
    }

    // Step 3: Synthesis (Gemini 3.1 Pro) summarizes the findings
    const synthesisPrompt = `Du har genomfört en djup research-loop för sökningen: "${query}"

Här är resultaten från webbläsar-agenten:
${JSON.stringify(results, null, 2)}

Sammanställ en professionell lista över de mest relevanta utlysningarna du hittat. Använd markdown-rubriker (##) för varje utlysning så att de kan extraheras korrekt.

För varje utlysning (i en egen sektion som börjar med ## Namn), inkludera:
## [Namn på utlysningen]
- **Finansiär**: [Namn]
- **Deadline**: [Datum]
- **Maxbelopp**: [Summa]
- **Beskrivning**: [Kort text om utlysningen och varför den passar SITK]
- **URL**: [Länk]

Avsluta med en sammanfattande rekommendation. Skriv på professionell svenska. Om inga relevanta utlysningar hittades, förklara varför.`;

    const synthesisText = await generateWithFallback(modelPro, synthesisPrompt, modelFallback);

    res.json({
      success: true,
      plan: searchSteps,
      rawResults: results,
      synthesis: synthesisText
    });

  } catch (error) {
    console.error('Deep search error:', error.message);
    res.status(500).json({ error: 'Failed to perform deep search' });
  }
});

// Proxy endpoint for Browser Use API - Run task
app.post('/api/browser-use/run', async (req, res) => {
  try {
    const { task } = req.body;
    const data = await runBrowserCommand(task);
    res.json(data);
  } catch (error) {
    console.error('Browser Use API error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to run browser task'
    });
  }
});

// Proxy endpoint for Browser Use API - Create session
app.post('/api/browser-use/sessions', async (req, res) => {
  try {
    const response = await axios.post(
      `${BROWSER_USE_BASE_URL}/sessions`,
      req.body,
      {
        headers: {
          'x-api-key': BROWSER_USE_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Browser Use API error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to create session'
    });
  }
});

// Proxy endpoint for Browser Use API - Send message to session
app.post('/api/browser-use/sessions/:sessionId/messages', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const response = await axios.post(
      `${BROWSER_USE_BASE_URL}/sessions/${sessionId}/messages`,
      req.body,
      {
        headers: {
          'x-api-key': BROWSER_USE_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    res.json(response.data);
  } catch (error) {
    console.error('Browser Use API error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to send message'
    });
  }
});

// Specialized discovery endpoint with multi-step research loop
app.post('/api/discover-grants', async (req, res) => {
  try {
    const { query } = req.body;

    // Step 1: Planning - Use Gemini 3.1 Pro to create a diverse search strategy
    const planPrompt = `Du är en expert på att hitta nischade och regionala forskningsanslag i Sverige.
Sandvikens IT Kår (SITK) fokuserar på AI, digitalisering, social hållbarhet och regional utveckling.
Användaren vill hitta FLER leads för projektmedel med start eller huvudfokus på 2026.

Skapa en sökplan med 4 specifika, distinkta sökinstruktioner som fokuserar på olika källor:
1. Regionala medel (t.ex. Region Gävleborg, Region Stockholm, Länsstyrelsen Gävleborg)
2. Statliga nischade medel (t.ex. Energimyndigheten, Vinnova - särskilt program för AI/digitalisering, Post- och telestyrelsen)
3. Privata stiftelser (t.ex. Arvsfonden, Postkodstiftelsen, Familjen Kamprads stiftelse)
4. EU-program anpassade för svenska aktörer (t.ex. Digital Europe via Vinnova, Interreg, Tillväxtverkets regionalfond)

Returnera instruktionerna som en JSON-array med strängar. Var så specifik som möjligt i varje sökinstruktion.`;

    const planText = await generateWithFallback(modelPro, planPrompt, modelFallback);
    let searchSteps = [];
    try {
      const jsonMatch = planText.match(/\[.*\]/s);
      searchSteps = JSON.parse(jsonMatch ? jsonMatch[0] : planText);
    } catch (e) {
      console.error('Failed to parse discovery plan:', planText);
      searchSteps = [
        "Sök efter regionala projektmedel för digitalisering i Gävleborg 2026",
        "Leta efter Vinnovas utlysningar för AI i offentlig sektor 2026",
        "Sök efter stiftelsemedel för social innovation och inkludering i Sverige",
        "Hitta EU-medel för regional digital transformation via Tillväxtverket"
      ];
    }

    // Step 2: Execution - Run searches in parallel (or sequence to avoid rate limits)
    const allResults = [];
    for (const step of searchSteps.slice(0, 4)) {
      console.log(`Discovery Step: ${step}`);
      try {
        const browserResult = await runBrowserCommand(step);
        allResults.push({ step, output: browserResult.output || browserResult.result || '' });
      } catch (err) {
        console.error(`Discovery step failed: ${step}`, err.message);
      }
    }

    // Step 3: Synthesis - Aggregate and format as unique grants
    const synthesisPrompt = `Du har genomfört en omfattande sökning efter nya projektmedel för 2026 för SITK.
Här är rådata från flera sökningar:
${JSON.stringify(allResults, null, 2)}

Sammanställ en lista på 6-12 UNIKA och DEFINITIVA utlysningar som är relevanta för SITK:s fokus (AI, digitalisering, regional utveckling).
Använd exakt detta format för varje utlysning (för att underlätta maskinell parsning):

## [Namn på utlysningen]
- **Finansiär**: [Namn på myndighet/organisation]
- **Deadline**: [Datum eller "Löpande"]
- **Maxbelopp**: [Summa]
- **Beskrivning**: [Kort teknisk beskrivning av vad man kan söka för]
- **Relevans**: [Kort motivering varför detta passar SITK]
- **URL**: [Direktlänk till utlysningen]

Skriv på professionell svenska. Ge endast listan. Rangordna efter strategisk relevans.`;

    const finalOutput = await generateWithFallback(modelFlash, synthesisPrompt, modelFallback);

    res.json({
      success: true,
      output: finalOutput
    });

  } catch (error) {
    console.error('Discovery loop error:', error.message);
    res.status(500).json({ error: 'Failed to complete discovery loop' });
  }
});

// Search grants endpoint (Legacy/Standard search)
app.post('/api/search-grants', async (req, res) => {
  try {
    const { query, filters } = req.body;
    const searchTask = `Sök efter aktuella utlysningar för projektmedel, anslag och innovationsstöd för år 2026. Sökord: ${query || 'AI projektmedel 2026 Vinnova Tillväxtverket'}. Returnera utlysningens namn, finansiär, deadline, maxbelopp, beskrivning och länk.`;
    const data = await runBrowserCommand(searchTask);
    res.json(data);
  } catch (error) {
    console.error('Search grants error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.response?.data?.message || 'Failed to search grants'
    });
  }
});

// Generate application draft endpoint
app.post('/api/generate-application', async (req, res) => {
  try {
    const { grantInfo, projectInfo, sitkProfile } = req.body;
    const prompt = `Du är en expert på att skriva bidragsansökningar för svenska innovation- och forskningsprojekt.
Skapa ett komplett ansökningsutkast baserat på följande information.

UTLYSNING: ${JSON.stringify(grantInfo)}
PROJEKTIDÉ: ${JSON.stringify(projectInfo)}
SÖKANDE PROFIL (SITK): ${JSON.stringify(sitkProfile)}

Returnera ett JSON-objekt med exakt följande fält:
{
  "summary": "En säljande sammanfattning av projektet",
  "projectDescription": "En detaljerad beskrivning av projektet, dess relevans och bakgrund",
  "goals": "Tydliga och mätbara mål och förväntade resultat",
  "implementation": "En genomförandeplan med tidslinje och aktiviteter",
  "budget": "En motiverad budget och resursbehov",
  "competence": "Beskrivning av organisationens (SITK) och partners kompetens",
  "dissemination": "Plan för spridning och nyttiggörande av resultat"
}

Skriv på professionell svenska. Ge endast JSON-svaret.`;

    const text = await generateWithFallback(modelPro, prompt, modelFallback);
    let content;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      content = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      res.json({ success: true, content });
    } catch (e) {
      console.error('Failed to parse generation output:', text);
      res.status(500).json({ error: 'Failed to process generated content' });
    }
  } catch (error) {
    console.error('Generate application error:', error.message);
    res.status(500).json({ error: 'Failed to generate application' });
  }
});


// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist', 'index.html'));
  });
}

// Export the app for Vercel
export default app;

// Only listen if run directly (not in Vercel)
if (process.env.NODE_ENV !== 'production' && import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
