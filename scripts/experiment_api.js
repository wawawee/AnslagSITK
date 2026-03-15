import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: './.env' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOOGLE_GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const BROWSER_USE_API_KEY = process.env.BROWSER_USE_API_KEY;

if (!GOOGLE_GEMINI_API_KEY || !BROWSER_USE_API_KEY) {
  console.error('Missing API keys in .env file');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GOOGLE_GEMINI_API_KEY);
const modelPro = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });
const modelFlash = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

const BROWSER_USE_BASE_URL = 'https://api.browser-use.com/api/v3';

async function runBrowserCommand(task) {
  console.log(`\n[Browser Use] Running task: "${task.substring(0, 100)}..."`);
  try {
    const response = await axios.post(
      `${BROWSER_USE_BASE_URL}/sessions`,
      { task, model: "bu-mini" },
      {
        headers: {
          'X-Browser-Use-API-Key': BROWSER_USE_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 180000 // 3 minutes timeout for cloud tasks
      }
    );
    console.log(`[Browser Use] Session started: ${response.data.id || response.data.session_id}`);

    // In a real scenario, we might want to poll for completion if it's not synchronous
    // But Browser Use Cloud /sessions is often synchronous or returns initial result
    return response.data;
  } catch (err) {
    console.error(`[Browser Use] Error: ${err.response?.data?.detail || err.message}`);
    return { error: err.message };
  }
}

async function experiment(query = "Hitta nischade projektmedel för AI och digitalisering i Gävleborg 2026") {
  console.log(`\n=== Starting Experiment for: "${query}" ===\n`);

  // Step 1: Planning
  console.log('[Gemini] Planning search strategy...');
  const planPrompt = `Du är en expert på att hitta nischade och regionala forskningsanslag i Sverige.
Sandvikens IT Kår (SITK) fokuserar på AI, digitalisering, social hållbarhet och regional utveckling.
Användaren vill hitta FLER leads för projektmedel med start eller huvudfokus på 2026.

MÅL: ${query}

Skapa en sökplan med 3-4 specifika, distinkta sökinstruktioner som fokuserar på olika källor:
1. Regionala medel (Gävleborg/Sandviken fokus)
2. Statliga nischade medel (Vinnova/Energimyndigheten/Tillväxtverket)
3. Privata stiftelser (Göranssonska, Postkodstiftelsen etc.)

Returnera instruktionerna som en JSON-array med strängar.`;

  const planResult = await modelPro.generateContent(planPrompt);
  const planText = planResult.response.text();
  let searchSteps = [];
  try {
    const jsonMatch = planText.match(/\[.*\]/s);
    searchSteps = JSON.parse(jsonMatch ? jsonMatch[0] : planText);
  } catch (e) {
    console.warn('Failed to parse plan JSON, using fallback steps');
    searchSteps = [query];
  }

  console.log(`[Gemini] Search steps: ${JSON.stringify(searchSteps, null, 2)}`);

  // Step 2: Execution
  const allResults = [];
  for (let i = 0; i < searchSteps.length; i++) {
    const result = await runBrowserCommand(searchSteps[i]);
    allResults.push({ step: searchSteps[i], output: result.output || result.result || JSON.stringify(result) });
  }

  // Step 3: Synthesis
  console.log('\n[Gemini] Synthesizing results...');
  const synthesisPrompt = `Du har genomfört en omfattande sökning efter nya projektmedel för 2026 för SITK.
Här är rådata från flera sökningar:
${JSON.stringify(allResults, null, 2)}

Sammanställ en lista på de 5 mest lovande och UNIKA utlysningarna.
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

  const finalResult = await modelFlash.generateContent(synthesisPrompt);
  const finalOutput = finalResult.response.text();

  console.log('\n=== FINAL DISCOVERY RESULTS ===\n');
  console.log(finalOutput);
}

const query = process.argv[2];
experiment(query);
