#!/usr/bin/env node
/**
 * generate-ansokan.js — Genererar en komplett anslagsansökan som PDF
 * Använder OpenRouter:s gratisrouting (openrouter/free) — inga krediter krävs.
 *
 * Användning: node scripts/generate-ansokan.js [entity-id] [gemenskap] [output.pdf]
 * Exempel:   node scripts/generate-ansokan.js klattertrader "" "" 
 *            node scripts/generate-ansokan.js klattertrader "klattertradet-therapy-platform" ansokan.pdf
 *
 * Lämna gemenskap tom för att låta AI:n välja bästa anslag.
 */

import 'dotenv/config';
import OpenAI from 'openai';
import PDFDocument from 'pdfkit';
import fs from 'fs';

// === Konfiguration ===
const ENTITY_ID = process.argv[2] || 'klattertrader';
const PROJECT_HINT = process.argv[3] || '';  // frivillig: t.ex. github-repo eller projektbeskrivning
const OUTPUT = process.argv[4] || `/Users/perbrinell/Desktop/ansokan-${ENTITY_ID}-${Date.now()}.pdf`;

// === Entiteter ===
const ENTITIES = {
  'per-brinell': {
    name: 'Per Brinell',
    orgNr: '19780430-7531',
    phone: '076-0606 934',
    email: 'perbrinell@gmail.com',
    description: 'Innovatör och fullstack-utvecklare med 15+ års erfarenhet inom AI, systemarkitektur, och digital transformation. Driver utveckling av AI-agenter, open source-verktyg och TwistedStacks-ekosystemet.',
    focusAreas: ['AI-utveckling', 'Systemarkitektur', 'Open Source', 'Digital innovation', 'Agent-baserade system'],
    githubAccounts: ['wawawee', 'finasteos'],
  },
  'sitk': {
    name: 'Sandvikens IT-Kår (SITK)',
    orgNr: '',
    phone: '',
    email: 'styrelsen@sitk.se',
    description: 'Ideell förening och digital katalysator för Sandviken-regionen. Främjar AI-kompetens, digital hållbarhet, ungdomsverksamhet och regional utveckling genom teknik.',
    focusAreas: ['AI-utbildning', 'Digital hållbarhet', 'Regional utveckling', 'Ungdomsverksamhet', 'Open Source'],
    githubAccounts: [],
  },
  'klattertrader': {
    name: 'Klätterträder AB',
    orgNr: '',
    phone: '',
    email: 'info@klattertradet.se',
    description: 'Teknikkonsult och produktutveckling inom innovativa digitala lösningar, AI-drivna terapiverktyg, klätterutrustning och äventyrsprodukter.',
    focusAreas: ['AI-terapi', 'Produktutveckling', 'Digital innovation', 'Hållbarhet', 'E-hälsa'],
    githubAccounts: ['hlivfachapman2000'],
    projectRepos: ['klattertradet-therapy-platform', 'klattertradet'],
  },
  'horizonten': {
    name: 'Horizonten Holding',
    orgNr: '',
    phone: '',
    email: '',
    description: 'Holdingbolag för teknikinvesteringar — fokuserar på AI-drivna startups, digital infrastruktur och framtidens arbetsplats.',
    focusAreas: ['AI-investeringar', 'Tech-startups', 'Digital infrastruktur', 'Framtidens arbete'],
    githubAccounts: ['hlivfachapman2000', 'AuEpic'],
    projectRepos: ['TWISTEDSTACKS.COM', 'twisted-main-demo'],
  },
};

const entity = ENTITIES[ENTITY_ID];
if (!entity) {
  console.error(`❌ Entitet "${ENTITY_ID}" hittades inte. Välj: ${Object.keys(ENTITIES).join(', ')}`);
  process.exit(1);
}

// === OpenRouter — gratis routing ===
// openrouter/free = routers mellan tillgängliga gratismodeller (google/gemma-4-31b, etc.)
// Fallback: alla API-nycklar med google/gemini-2.0-flash-001
const ALL_KEYS = [
  { name: 'carl', key: process.env.OPENROUTER_KEY_CARL },
  { name: 'perbrinell', key: process.env.OPENROUTER_KEY_PERBRINELL },
  { name: 'perbrinell-map', key: process.env.OPENROUTER_KEY_PERBRINELL_MAP },
  { name: 'cymwave', key: process.env.OPENROUTER_KEY_CYMWAVE },
  { name: 'hlivfa', key: process.env.OPENROUTER_KEY_HLIVFA },
  { name: 'pellegrosso', key: process.env.OPENROUTER_KEY_PELLEGROSSO },
  { name: 'leadagenticos', key: process.env.OPENROUTER_KEY_LEADAGENTICOS },
].filter(k => k.key && !k.key.startsWith('sk-or-v1-your'));

const OR_HEADERS = {
  'HTTP-Referer': 'https://sitk.se',
  'X-OpenRouter-Title': 'AnslagSITK',
};

// === Hjälpfunktion: LLM-anrop med gratisrouter först, sedan fallback ===
async function askLLM(prompt, { maxTokens = 4000, temperature = 0.7 } = {}) {
  // Strategi 1: openrouter/free — prova ALLA nycklar (gratis, ingen kredit)
  for (const { name, key } of ALL_KEYS) {
    try {
      const client = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: key, defaultHeaders: OR_HEADERS });
      console.log(`  🤖 openrouter/free [nyckel: ${name}]...`);
      const r = await client.chat.completions.create({
        model: 'openrouter/free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature,
      });
      const txt = r.choices[0].message.content;
      console.log(`     → ${txt.length} tecken, modell: ${r.model || '?'}`);
      return txt;
    } catch (err) {
      console.warn(`     ⚠ openrouter/free via "${name}" misslyckades: ${err.message.slice(0, 80)}`);
    }
  }

  // Strategi 2: google/gemini-2.0-flash-001 (få tokens, men fungerar)
  for (const { name, key } of ALL_KEYS) {
    try {
      const client = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: key, defaultHeaders: OR_HEADERS });
      console.log(`  🤖 google/gemini-2.0-flash-001 [nyckel: ${name}]...`);
      const r = await client.chat.completions.create({
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: Math.min(maxTokens, 2000),
        temperature,
      });
      const txt = r.choices[0].message.content;
      console.log(`     → ${txt.length} tecken`);
      return txt;
    } catch (err) {
      console.warn(`     ⚠ "${name}" misslyckades: ${err.message.slice(0, 100)}`);
    }
  }

  throw new Error(`Alla ${ALL_KEYS.length} nycklar misslyckades`);
}

// === Hjälp: extrahera JSON från LLM-svar ===
function extractJSON(text) {
  // Försök hitta JSON-objekt — använd icke-girig matchning
  // och prova flera kandidater tills en parsar
  const candidates = [];
  // Matcha { ... } icke-girigt
  const objMatches = text.matchAll(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
  for (const m of objMatches) candidates.push(m[0]);
  // Matcha [ ... ] icke-girigt
  const arrMatches = text.matchAll(/\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\]/g);
  for (const m of arrMatches) candidates.push(m[0]);

  for (const c of candidates) {
    try { return JSON.parse(c); } catch {}
  }
  // Fallback: girig matchning om inget funkade
  const greedy = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (greedy) {
    try { return JSON.parse(greedy[0]); } catch {}
  }
  return null;
}

// === Steg 1: Hitta verkliga svenska anslag ===
async function findGrants() {
  const focusStr = entity.focusAreas.join(', ');
  const prompt = `Du är expert på svenska anslag, bidrag och finansiering för ${entity.description}

Fokusområden: ${focusStr}
${PROJECT_HINT ? `Specifikt projekt: ${PROJECT_HINT}` : ''}

Hitta 3-4 KONKRETA, VERKLIGA utlysningar som passar denna organisation just nu (2026).

För varje anslag, inkludera:
- Exakt namn på utlysningen
- Vilken organisation/myndighet som ger anslaget (Vinnova, Tillväxtverket, Almi, Region Gävleborg, ESF, etc.)
- DIREKT URL till ansökningssidan (var man faktiskt ansöker)
- Deadline/sista ansökningsdag (exakt datum)
- Maxbelopp man kan söka
- Eventuell medfinansieringskrav
- Kontaktperson(er) hos bidragsgivaren om känt
- Vilka regler/villkor som gäller (t.ex. stödberättigade kostnader, projektlängd)
- Exempel på projekt som TIDIGARE FÅTT detta anslag (om känt)

Returnera ENDAST ett JSON-objekt:
{
  "grants": [
    {
      "name": "...",
      "funder": "...", 
      "url": "https://...",
      "deadline": "2026-XX-XX",
      "maxAmount": "...",
      "cofinancing": "...",
      "contactPerson": "...",
      "rules": "...",
      "previousRecipients": "...",
      "relevance": "varför detta passar just vår organisation"
    }
  ],
  "recommendation": "kort rekommendation om vilket anslag som är bäst lämpat och varför"
}

VIKTIGT: Alla URL:er måste vara VERKLIGA, fungerande länkar till riktiga ansökningssidor. Hitta inte på länkar. Använd endast svenska anslag (Vinnova, Tillväxtverket, Almi, Region Gävleborg, ESF-rådet, Arvsfonden, Postkodstiftelsen, etc).`;

  console.log('\n🔍 Steg 1: Söker verkliga svenska anslag...');
  const result = await askLLM(prompt, { maxTokens: 4000, temperature: 0.3 });
  const data = extractJSON(result);
  
  if (data?.grants?.length) {
    console.log(`  ✅ Hittade ${data.grants.length} anslag:`);
    data.grants.forEach(g => console.log(`     - ${g.name} (${g.funder}) → ${g.url}`));
    return data;
  }
  
  // Fallback om LLM inte returnerade JSON
  console.log('  ⚠ Kunde inte tolka svar som JSON, använder grunddata');
  return {
    grants: [{
      name: 'Vinnova: Innovativa startups 2026',
      funder: 'Vinnova',
      url: 'https://www.vinnova.se/sok-finansiering/',
      deadline: '2026-06-30',
      maxAmount: '2 000 000 kr',
      cofinancing: '25% egen insats',
      contactPerson: 'Se vinnova.se för aktuell handläggare',
      rules: 'Projektet ska vara innovationsdrivet, ha hög risknivå och stor potential.',
      previousRecipients: 'Flera svenska AI-startups har fått finansiering via Vinnovas program.',
      relevance: 'Passar organisationens fokus på AI och innovation.',
    }],
    recommendation: 'Vinnova är en naturlig första ansökan givet organisationens innovationsprofil.',
  };
}

// === Steg 2: Generera fullständigt projektförslag ===
async function generateProposal(grantsData) {
  const bestGrant = grantsData.grants[0];
  const allGrantsText = grantsData.grants.map((g, i) =>
    `${i+1}. ${g.name} — ${g.funder}\n   URL: ${g.url}\n   Deadline: ${g.deadline}\n   Max: ${g.maxAmount}\n   Medfinansiering: ${g.cofinancing}\n   Kontakt: ${g.contactPerson}\n   Regler: ${g.rules}\n   Tidigare mottagare: ${g.previousRecipients}`
  ).join('\n\n');

  const prompt = `Du ska skriva en PROFESSIONELL, UTFÖRLIG anslagsansökan för:

SÖKANDE: ${entity.name}
${entity.orgNr ? `Org.nr: ${entity.orgNr}` : ''}
${entity.phone ? `Tel: ${entity.phone}` : ''}
${entity.email ? `E-post: ${entity.email}` : ''}

OM SÖKANDE: ${entity.description}
FOKUSOMRÅDEN: ${entity.focusAreas.join(', ')}

${PROJECT_HINT ? `PROJEKTIDÉ: ${PROJECT_HINT}` : ''}

TILLGÄNGLIGA ANSLAG:
${allGrantsText}

REKOMMENDATION: ${grantsData.recommendation}

═══════════════════════════════════════
SKRIV EN KOMPLETT ANSLAGANSÖKAN med följande sektioner.
Var UTFÖRLIG — varje sektion ska vara minst 3-5 meningar.
Returnera ENDAST JSON:
═══════════════════════════════════════

{
  "title": "Ansökans titel",
  
  "summary": "KORT sammanfattning (2-3 meningar) av projektet och vad ni söker",

  "anslagSomSokes": "Lista ALLA anslag ni söker med EXAKTA URL:er, deadlines, belopp, och kontaktpersoner. Formatera som text med punktlista.",

  "problemDescription": "UTFÖRLIG beskrivning av problemet/behovet som projektet löser. Varför är detta viktigt nu? Referera till samhällsutmaningar, forskning, eller statistik om relevant.",

  "projectDescription": "UTFÖRLIG beskrivning av projektet — vad ska göras, hur, och varför är er lösning innovativ? Beskriv teknik, metod, och angreppssätt.",

  "goals": "Tydliga, mätbara mål. Specificera KPI:er och förväntade resultat. Använd SMART-format (Specifikt, Mätbart, Accepterat, Realistiskt, Tidsatt).",

  "targetGroup": "Vilka är målgruppen? Hur många nås? Hur gynnas de?",

  "implementation": "UTFÖRLIG genomförandeplan med faser, milstolpar och tidslinje. Använd en tabellstruktur i texten. 6-18 månader.",

  "budget": "DETALJERAD budget i tabellformat: personalkostnader, utrustning, resor, konsulter, overhead, etc. Specificera även medfinansiering och totalkostnad.",

  "organization": "UTFÖRLIG beskrivning av organisationens kompetens, tidigare relevanta projekt, teamets sammansättning, och varför just ni kan genomföra detta.",

  "partners": "Eventuella partners, samarbeten, eller referenspersoner. Om inga, föreslå relevanta potentiella partners i regionen.",

  "dissemination": "Hur ska resultaten spridas? Konferenser, publikationer, open source, workshops? Specificera kanaler och målgrupper för spridning.",

  "risks": "Identifiera 3-5 risker och hur de hanteras. Var ärlig och konstruktiv.",

  "previousSuccess": "Referera till TIDIGARE PROJEKT som fått liknande anslag. Ge exempel på projekt från ${grantsData.grants[0]?.funder || 'bidragsgivaren'} som lyckats. Om ni har egna tidigare anslag, nämn dem.",

  "closing": "Avslutande argument — varför just detta projekt och just denna organisation förtjänar anslaget. Sammanfatta värdet för samhället och för bidragsgivarens mål.",

  "attachments": "Lista över bilagor som bör bifogas (CV, årsredovisning, offerter, etc.)"
}

VIKTIGT:
- Alla URL:er till anslag MÅSTE vara verkliga och fungerande.
- Använd professionellt, formellt språk genomgående.
- Var konkret — inga vaga formuleringar.
- Budgeten ska vara realistisk och specificerad.
- Referera till bidragsgivarens EGNA mål och prioriteringar.`;

  console.log('\n✍️  Steg 2: Genererar fullständig anslagsansökan...');
  const result = await askLLM(prompt, { maxTokens: 4000, temperature: 0.4 });
  const data = extractJSON(result);

  if (data?.title) {
    console.log(`  ✅ Titel: ${data.title}`);
    return data;
  }

  console.log('  ⚠ Kunde inte tolka som JSON — använder råtext');
  return { title: `Anslagsansökan — ${entity.name}`, summary: result, raw: true };
}

// === Steg 3: Skapa PDF ===
function createPDF(content, grantsData) {
  return new Promise((resolve, reject) => {
    console.log(`\n📄 Steg 3: Skapar PDF: ${OUTPUT}`);
    // === Nyckelvarning ===
    const totalKeys = [
      process.env.OPENROUTER_KEY_CARL, process.env.OPENROUTER_KEY_PERBRINELL,
      process.env.OPENROUTER_KEY_PERBRINELL_MAP, process.env.OPENROUTER_KEY_CYMWAVE,
      process.env.OPENROUTER_KEY_HLIVFA, process.env.OPENROUTER_KEY_PELLEGROSSO,
      process.env.OPENROUTER_KEY_LEADAGENTICOS,
    ].filter(k => k && !k.startsWith('sk-or-v1-your'));
    if (totalKeys.length < 3) {
      console.warn(`  ⚠ Endast ${totalKeys.length} av 7 OpenRouter-nycklar konfigurerade i .env`);
    }

    // === Skapa PDF ===
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 45, bottom: 45, left: 55, right: 55 },
      bufferPages: true,
    });
    const out = fs.createWriteStream(OUTPUT);
    doc.pipe(out);

    // === Sidhuvud ===
    const addHeader = () => {
      const y = doc.y;
      doc.fontSize(9).font('Helvetica').fillColor('#888')
         .text(entity.name, 55, 20, { align: 'left' });
      if (entity.orgNr) doc.text(`Org.nr: ${entity.orgNr}`, 55, 32);
      if (entity.email) doc.text(entity.email, 300, 32, { align: 'left', width: 240 });
      doc.text(new Date().toLocaleDateString('sv-SE'), { align: 'right' });
      doc.moveTo(55, 48).lineTo(540, 48).stroke('#ccc');
      doc.moveDown(1.5);
    };

    // === Sidfot ===
    const addFooter = () => {
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        const bottom = doc.page.height - 40;
        doc.moveTo(55, bottom).lineTo(540, bottom).stroke('#ccc');
        doc.fontSize(8).font('Helvetica').fillColor('#aaa')
           .text(`${entity.name} — Anslagsansökan`, 55, bottom + 5, { align: 'left' });
        doc.text(`Sida ${i + 1} av ${pageCount}`, { align: 'right' });
      }
    };

    // === Titelblad ===
    doc.fontSize(9).font('Helvetica').fillColor('#666').text(entity.name, { align: 'right' });
    if (entity.orgNr) doc.text(`Org.nr: ${entity.orgNr}`, { align: 'right' });
    doc.moveDown(3);

    doc.fontSize(22).font('Helvetica-Bold').fillColor('#1a1a1a')
       .text(content.title || 'Anslagsansökan', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica').fillColor('#555')
       .text(`Inlämnad ${new Date().toLocaleDateString('sv-SE')}`, { align: 'center' });
    doc.moveDown(1.5);

    // Anslag som söks (översikt)
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#333').text('Söker anslag hos:', { align: 'center' });
    doc.moveDown(0.3);
    grantsData.grants.forEach((g, i) => {
      doc.fontSize(9).font('Helvetica').fillColor('#555')
         .text(`${g.funder} — ${g.name}`, { align: 'center' });
      doc.fontSize(8).fillColor('#888')
         .text(`${g.url}`, { align: 'center', link: g.url });
      doc.moveDown(0.1);
    });
    doc.moveDown(1);

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a1a1a')
       .text('Sammanfattning', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').fillColor('#333')
       .text(content.summary || '', { align: 'center', lineGap: 2 });
    doc.moveDown(2);

    doc.moveTo(200, doc.y).lineTo(395, doc.y).stroke('#ccc');
    doc.moveDown(1);

    // Ny sida för resten
    doc.addPage();
    addHeader();

    // === Sektioner ===
    const sections = [
      { title: '1. Anslag som söks', key: 'anslagSomSokes' },
      { title: '2. Problembeskrivning', key: 'problemDescription' },
      { title: '3. Projektbeskrivning', key: 'projectDescription' },
      { title: '4. Mål och förväntade resultat', key: 'goals' },
      { title: '5. Målgrupp', key: 'targetGroup' },
      { title: '6. Genomförandeplan', key: 'implementation' },
      { title: '7. Budget', key: 'budget' },
      { title: '8. Organisation och kompetens', key: 'organization' },
      { title: '9. Partners och samarbeten', key: 'partners' },
      { title: '10. Spridning av resultat', key: 'dissemination' },
      { title: '11. Risker och hantering', key: 'risks' },
      { title: '12. Tidigare framgångar och referensprojekt', key: 'previousSuccess' },
      { title: '13. Avslutande argument', key: 'closing' },
      { title: '14. Bilageförteckning', key: 'attachments' },
    ];

    for (const s of sections) {
      const text = content[s.key];
      if (!text || text.length < 5) continue;

      // Kolla om vi behöver ny sida
      if (doc.y > 680) doc.addPage();

      doc.fontSize(13).font('Helvetica-Bold').fillColor('#1a1a1a').text(s.title);
      doc.moveDown(0.3);
      doc.moveTo(55, doc.y).lineTo(540, doc.y).stroke('#e0e0e0');
      doc.moveDown(0.5);
      doc.fontSize(9.5).font('Helvetica').fillColor('#333')
         .text(text, { lineGap: 2.5, align: 'left', width: 485 });
      doc.moveDown(1.2);
    }

    // === Slut: kontaktinfo ===
    doc.moveDown(1);
    doc.moveTo(55, doc.y).lineTo(540, doc.y).stroke('#ccc');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#333').text('Kontaktuppgifter');
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica').fillColor('#444')
       .text(`${entity.name}`);
    if (entity.orgNr) doc.text(`Org.nr: ${entity.orgNr}`);
    if (entity.phone) doc.text(`Tel: ${entity.phone}`);
    if (entity.email) doc.text(`E-post: ${entity.email}`);
    doc.moveDown(0.5);
    doc.fontSize(7.5).font('Helvetica').fillColor('#aaa')
       .text(`Genererad av AnslagSITK • ${new Date().toLocaleDateString('sv-SE')} • OpenRouter /free routing`, { align: 'center' });

    // Lägg till sidfot
    addFooter();

    doc.end();
    out.on('finish', () => {
      console.log(`\n✅ KLAR! PDF: ${OUTPUT}`);
      console.log(`📊 Storlek: ${(fs.statSync(OUTPUT).size / 1024).toFixed(1)} KB`);
      console.log(`📄 Sidor: ${doc.bufferedPageRange().count}`);
      console.log(`🚀 Öppna: open "${OUTPUT}"\n`);
      resolve();
    });
    out.on('error', reject);
  });
}

// === Huvudflöde ===
async function main() {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║   ANSLAGSITK — Anslagsansökan Generator  ║`);
  console.log(`╠══════════════════════════════════════════╣`);
  console.log(`║ Sökande: ${entity.name.padEnd(32)}║`);
  console.log(`║ Modell:   openrouter/free (gratis)       ║`);
  console.log(`╚══════════════════════════════════════════╝`);

  // === Nyckelvarning innan vi börjar ===
  if (ALL_KEYS.length < 3) {
    console.warn(`⚠ VARNING: Endast ${ALL_KEYS.length} av 7 OpenRouter-nycklar konfigurerade i .env\n`);
  }

  // Steg 1: Hitta anslag
  const grantsData = await findGrants();

  // Steg 2: Generera ansökan
  const content = await generateProposal(grantsData);

  // Steg 3: Skapa PDF
  await createPDF(content, grantsData);
}

main().catch(err => { console.error('\n❌ Fel:', err.message); process.exit(1); });
